/**
 * Desktop's game join link: `cockatrice://joingame?hostname=…&port=…&roomid=…&gameid=…[&game=…]`
 * (`cockatrice/src/interface/widgets/server/game_link.cpp` makeGameJoinLink, parsed by
 * `interface/intents/url_parser.cpp` createJoinGameIntent).
 *
 * Webatrice runs inside a MemoryRouter, so a game has no shareable web URL; the desktop link is
 * the one format both clients understand. Desktop opens it from chat (and the OS handler);
 * Webatrice renders it as a join button in chat and runs the room → game join flow.
 */

export interface GameJoinLink {
  hostname: string;
  port: string;
  roomId: number;
  gameId: number;
  /** The game description, when the sender's client embedded one. */
  description: string;
}

export type GameJoinLinkError = 'hostname' | 'port' | 'roomId' | 'gameId';

export type ParsedGameJoinLink =
  | { ok: true; link: GameJoinLink }
  | { ok: false; error: GameJoinLinkError };

/**
 * Matches a game link as one chat word, as desktop's ChatView does (`fullWordUpToSpaceOrEnd`
 * starting with `cockatrice://` whose host is `joingame`, case-insensitive). Capturing so a
 * `String.split` keeps the links.
 */
export const GAME_LINK_REGEX = /(cockatrice:\/\/joingame(?![^\s/?#])\S*)/gi;

/** Builds the link exactly as desktop does; values are percent-encoded so any description survives chat. */
export function makeGameJoinLink({ hostname, port, roomId, gameId, description }: GameJoinLink): string {
  const query = [
    ['hostname', hostname],
    ['port', String(port)],
    ['roomid', String(roomId)],
    ['gameid', String(gameId)],
  ];
  if (description) {
    query.push(['game', description]);
  }
  return `cockatrice://joingame?${query.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[+-]?\d+$/.test(value.trim())) {
    return null;
  }
  return Number.parseInt(value, 10);
}

/** Reads a link with desktop's validation order and rules (createJoinGameIntent). */
export function parseGameJoinLink(url: string): ParsedGameJoinLink {
  const match = /^cockatrice:\/\/joingame\/?(?:\?([^#]*))?/i.exec(url.trim());
  const params = new Map<string, string>();
  for (const pair of (match?.[1] ?? '').split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const key = decode(eq < 0 ? pair : pair.slice(0, eq));
    if (!params.has(key)) {
      params.set(key, decode(eq < 0 ? '' : pair.slice(eq + 1)));
    }
  }

  const hostname = params.get('hostname') ?? '';
  if (!hostname) {
    return { ok: false, error: 'hostname' };
  }
  const port = params.get('port') ?? '';
  const portNumber = parseInteger(port);
  if (portNumber === null || portNumber < 0 || portNumber > 65535) {
    return { ok: false, error: 'port' };
  }
  const roomId = parseInteger(params.get('roomid'));
  if (roomId === null) {
    return { ok: false, error: 'roomId' };
  }
  const gameId = parseInteger(params.get('gameid'));
  if (gameId === null) {
    return { ok: false, error: 'gameId' };
  }
  return { ok: true, link: { hostname, port, roomId, gameId, description: params.get('game') ?? '' } };
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The hostname/port a desktop client would dial for a Webatrice connect target. A target host
 * with a path (`server.example/servatrice`) is reached on the scheme's default port (wss → 443,
 * ws → 80 for local hosts, as Sockatrice's buildWebSocketUrl picks); desktop treats 443 and 80 as
 * WebSocket ports too (`RemoteClient::connectToHost`).
 */
export function gameLinkServer(target: { host: string; port: string | number }): { hostname: string; port: string } {
  const slash = target.host.indexOf('/');
  if (slash < 0) {
    return { hostname: target.host, port: String(target.port) };
  }
  const hostname = target.host.slice(0, slash);
  const lower = hostname.toLowerCase();
  const local = LOCAL_HOSTNAMES.has(lower) || lower.endsWith('.localhost');
  return { hostname, port: local ? '80' : '443' };
}

/** True when the text holds at least one game link. */
export function containsGameLink(text: string): boolean {
  return /cockatrice:\/\/joingame(?![^\s/?#])/i.test(text);
}

/** Hostnames compare case-insensitively, as desktop's IntentJoinServerGame does. */
export function isSameServerHost(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
