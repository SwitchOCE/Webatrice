import { readDeckTags } from './deckTags';
import type { HydratedDeck } from './types';

/**
 * Deck share links (Cockatrice 3.1, #7241).
 *
 * Desktop's link is `cockatrice://opendeck?share=<token>&hostname=<host>&port=<port>`
 * (`DeckShareUtils::buildShareLink`), which the OS hands to the desktop client.
 * A browser can't register that scheme, so Webatrice's link is its own page
 * with the same parameters in the fragment:
 * `https://<webatrice>/#share=<token>&hostname=<host>&port=<port>`.
 *
 * The token is a bearer secret (Servatrice hands it to anyone who presents
 * it), and desktop keeps it out of its logs. A fragment is never sent to the
 * web host or in a Referer, so it can't reach access logs the way a query
 * would. Opening the link loads the app, `captureDeckShareLink` takes the
 * fragment out of the address bar and keeps it in memory (the router is a
 * MemoryRouter, so the URL is read once, on load) and, after login, the app
 * opens `/decks/shared?<the same parameters>` inside the router.
 * Either form, or a link with a query, can also be pasted into
 * "Open shared deck", which opens the same route.
 */

export interface DeckShareLink {
  token: string;
  hostname: string;
  port: string;
}

/** Desktop `IntentUrlParser::createOpenDeckIntent` rejections, in its order. */
export type DeckShareLinkProblem = 'invalid' | 'hostname' | 'port' | 'share';

const SHARE_PARAM = 'share';
const HOSTNAME_PARAM = 'hostname';
const PORT_PARAM = 'port';

/** A link to `base` (Webatrice's own address) that opens `link`. */
export function buildDeckShareLink(base: string, link: DeckShareLink): string {
  const url = new URL(base);
  url.search = '';
  url.hash = deckShareQuery(link);
  return url.toString();
}

/** The query of the shared-deck route (and of a Webatrice share link). */
export function deckShareQuery(link: DeckShareLink): string {
  const params = new URLSearchParams();
  params.set(SHARE_PARAM, link.token);
  params.set(HOSTNAME_PARAM, link.hostname);
  params.set(PORT_PARAM, link.port);
  return params.toString();
}

/** Read the shared-deck route's query, with desktop's checks. */
export function parseDeckShareQuery(params: URLSearchParams): DeckShareLink | { problem: DeckShareLinkProblem } {
  const hostname = params.get(HOSTNAME_PARAM)?.trim() ?? '';
  const port = params.get(PORT_PARAM)?.trim() ?? '';
  const token = params.get(SHARE_PARAM)?.trim() ?? '';
  if (!hostname) {
    return { problem: 'hostname' };
  }
  const portNumber = Number(port);
  if (!/^\d+$/.test(port) || portNumber <= 0 || portNumber > 65535) {
    return { problem: 'port' };
  }
  if (!token) {
    return { problem: 'share' };
  }
  return { token, hostname, port };
}

/** The parameters in a `#share=…` fragment, or `null` when it isn't one. */
function fragmentParams(hash: string): URLSearchParams | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.has(SHARE_PARAM) ? params : null;
}

/**
 * Read a pasted share link: Webatrice's (`https://…/#share=…`, or the query
 * form) or desktop's (`cockatrice://opendeck?…`). Other schemes are refused.
 */
export function parseDeckShareLink(text: string): DeckShareLink | { problem: DeckShareLinkProblem } {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { problem: 'invalid' };
  }
  const desktop = url.protocol === 'cockatrice:' && url.hostname === 'opendeck';
  if (!desktop && url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { problem: 'invalid' };
  }
  return parseDeckShareQuery(fragmentParams(url.hash) ?? url.searchParams);
}

/** Validate and normalize a full WebSocket endpoint without discarding its path or port. */
export function shareServerFromEndpoint(endpoint: string | null | undefined): Omit<DeckShareLink, 'token'> | null {
  if (!endpoint) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
      return null;
    }
    return { hostname: url.href, port: url.port || (url.protocol === 'wss:' ? '443' : '80') };
  } catch {
    return null;
  }
}

/** Fail closed: a token is sent only to the exact live endpoint, or the live host's configured TCP port. */
export function isSameShareServer(
  link: DeckShareLink,
  endpoint: string | undefined,
  desktopPort?: string,
): boolean {
  const live = shareServerFromEndpoint(endpoint);
  if (!live) {
    return false;
  }
  const direct = shareServerFromEndpoint(link.hostname);
  if (direct) {
    return direct.hostname === live.hostname && direct.port === link.port;
  }
  return !!desktopPort && /^\d+$/.test(desktopPort)
    && Number(desktopPort) >= 1 && Number(desktopPort) <= 65535
    && new URL(live.hostname).hostname === link.hostname.toLowerCase()
    && Number(desktopPort) === Number(link.port);
}

/** Desktop `DeckShareUtils::formatShareExpiry`: local date and time, short. */
export function formatShareExpiry(unixSeconds: bigint | number, locale?: string): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/** Desktop `DeckList::Metadata::isEmpty`: format is not metadata; card references include provider ids. */
export function isBlankDeck(
  deck: Pick<HydratedDeck, 'name' | 'meta' | 'cards' | 'bannerCard' | 'bannerCardProviderId' | 'playmatXml' | 'tagsXml'>,
): boolean {
  const playmat = deck.playmatXml
    ? new DOMParser().parseFromString(deck.playmatXml, 'application/xml').documentElement
    : null;
  const hasPlaymatCard = playmat?.tagName === 'playmatCard'
    && !!(playmat.textContent || playmat.getAttribute('providerId'));
  return deck.cards.length === 0
    && !deck.name
    && !deck.meta.description
    && !deck.bannerCard
    && !deck.bannerCardProviderId
    && !hasPlaymatCard
    && readDeckTags(deck.tagsXml).length === 0;
}

/** The share link the page was loaded with, until login opens it. Memory only. */
let pendingLink: string | null = null;

/**
 * Move a share link from the page's fragment into memory and drop it from the
 * address bar, so it isn't left in browser history and a reload doesn't open
 * it again. Called once on load; returns whether there was one. Only the share
 * parameters are kept, as they came, so an incomplete link still reaches the
 * shared-deck page and its error.
 */
export function captureDeckShareLink(win: Window = window): boolean {
  const params = fragmentParams(win.location.hash);
  if (!params) {
    return false;
  }
  const link = new URLSearchParams();
  for (const name of [SHARE_PARAM, HOSTNAME_PARAM, PORT_PARAM]) {
    const value = params.get(name);
    if (value !== null) {
      link.set(name, value);
    }
    params.delete(name);
  }
  const rest = params.toString();
  try {
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}${rest ? `#${rest}` : ''}`);
  } catch {
    /* the address bar keeps the fragment; nothing else reads it */
  }
  pendingLink = link.toString();
  return true;
}

/** The parameters of the share link waiting for login, cleared as they are read. */
export function takePendingDeckShareLink(): string | null {
  const query = pendingLink;
  pendingLink = null;
  return query;
}
