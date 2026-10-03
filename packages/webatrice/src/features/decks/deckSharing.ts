import type { DeckCard } from './types';

/**
 * Deck share links (Cockatrice 3.1, #7241).
 *
 * Desktop's link is `cockatrice://opendeck?share=<token>&hostname=<host>&port=<port>`
 * (`DeckShareUtils::buildShareLink`), which the OS hands to the desktop client.
 * A browser can't register that scheme, so Webatrice's link is its own page
 * with the same query: `https://<webatrice>/?share=<token>&hostname=<host>&port=<port>`.
 * Opening it loads the app, `captureDeckShareLink` moves the query into
 * session storage (the router is a MemoryRouter, so the URL is read once, on
 * load) and, after login, the app opens `/decks/shared?<the same query>`.
 * Either form can also be pasted into "Open shared deck", which opens the
 * same route.
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
  url.hash = '';
  url.search = deckShareQuery(link);
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

/** Read a Webatrice or desktop (`cockatrice://opendeck?…`) share link. */
export function parseDeckShareLink(text: string): DeckShareLink | { problem: DeckShareLinkProblem } {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { problem: 'invalid' };
  }
  if (url.protocol === 'cockatrice:' && url.hostname !== 'opendeck') {
    return { problem: 'invalid' };
  }
  return parseDeckShareQuery(url.searchParams);
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

const PENDING_LINK_KEY = 'webatrice.pendingDeckShare';

/**
 * Move a share link's query from the page's address into session storage and
 * drop it from the address bar, so a reload doesn't open it again. Called once
 * on load; returns whether there was one. The query is kept as it came, so an
 * incomplete link still reaches the shared-deck page and its error.
 */
export function captureDeckShareLink(win: Window = window): boolean {
  const params = new URLSearchParams(win.location.search);
  if (!params.has(SHARE_PARAM)) {
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
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${rest ? `?${rest}` : ''}${win.location.hash}`);
  } catch {
    /* the address bar keeps the query; nothing else reads it */
  }
  try {
    win.sessionStorage.setItem(PENDING_LINK_KEY, link.toString());
  } catch {
    return false;
  }
  return true;
}

/** The query of the share link waiting for login, removed as it is read. */
export function takePendingDeckShareLink(win: Window = window): string | null {
  try {
    const query = win.sessionStorage.getItem(PENDING_LINK_KEY);
    win.sessionStorage.removeItem(PENDING_LINK_KEY);
    return query;
  } catch {
    return null;
  }
}
