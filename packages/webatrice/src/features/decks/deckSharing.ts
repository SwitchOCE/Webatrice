import { readDeckTags } from './deckTags';
import type { DeckCard, HydratedDeck } from './types';

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

/**
 * The machine a host entry names: Webatrice hosts may carry a scheme, a port
 * or a WebSocket path (`server.cockatrice.us/servatrice`), desktop's never do.
 */
function bareHostname(host: string): string {
  return host.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/:\d+$/, '');
}

/**
 * Whether a link's server is the one this session is logged into. Only the
 * machine is compared: a desktop link names Servatrice's TCP port, which a
 * browser can't use, while this session knows only its WebSocket address.
 */
export function isSameShareServer(link: DeckShareLink, hostname: string | undefined): boolean {
  return !!hostname && bareHostname(link.hostname) === bareHostname(hostname);
}

/** Desktop `DeckShareUtils::formatShareExpiry`: local date and time, short. */
export function formatShareExpiry(unixSeconds: bigint | number, locale?: string): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Desktop `DeckList::isBlankDeck`, which the editor's Share refuses: no cards
 * and no metadata (name, comments, format, banner card, tags). A named deck
 * without cards can still be shared.
 */
export function isBlankDeck(deck: Pick<HydratedDeck, 'name' | 'meta' | 'cards' | 'format' | 'bannerCard' | 'tagsXml'>): boolean {
  return deck.cards.length === 0
    && !deck.name.trim()
    && !deck.meta.description?.trim()
    && !deck.format
    && !deck.bannerCard
    && readDeckTags(deck.tagsXml).length === 0;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/**
 * Desktop `getDeckColorIdentity`: the colors of the main and side cards, in
 * WUBRG order — sent with an inline share so other clients can show it
 * without parsing the deck.
 */
export function deckColorIdentity(cards: readonly DeckCard[]): string {
  const colors = new Set<string>();
  for (const card of cards) {
    if (card.category === 'main' || card.category === 'sideboard') {
      card.colors?.forEach((color) => colors.add(color));
    }
  }
  return WUBRG.filter((color) => colors.has(color)).join('');
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
