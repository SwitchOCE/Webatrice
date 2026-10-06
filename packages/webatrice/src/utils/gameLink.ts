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

export interface LiveGameServer {
  /** Hostname of the live WebSocket endpoint, normalized by URL. */
  hostname: string;
  /** Port used by the browser's live WebSocket connection. */
  port: string;
  /** Configured TCP port used by Cockatrice desktop for this exact endpoint. */
  desktopPort?: string;
}

export interface GameLinkKnownHost {
  host: string;
  port: string;
  desktopPort?: string;
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

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

function parseInt32(value: string | undefined): number | null {
  const parsed = parseInteger(value);
  return parsed !== null && parsed >= INT32_MIN && parsed <= INT32_MAX ? parsed : null;
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
  const roomId = parseInt32(params.get('roomid'));
  if (roomId === null) {
    return { ok: false, error: 'roomId' };
  }
  const gameId = parseInt32(params.get('gameid'));
  if (gameId === null) {
    return { ok: false, error: 'gameId' };
  }
  return { ok: true, link: { hostname, port, roomId, gameId, description: params.get('game') ?? '' } };
}

/** True when the text holds at least one game link. */
export function containsGameLink(text: string): boolean {
  return /cockatrice:\/\/joingame(?![^\s/?#])/i.test(text);
}

/** Hostnames compare case-insensitively, as desktop's IntentJoinServerGame does. */
function isSameServerHost(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function parseWebSocketEndpoint(endpoint: string | null | undefined): URL | null {
  if (!endpoint) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function validDesktopPort(port: string | undefined): string | undefined {
  if (!port || !/^\d+$/.test(port)) {
    return undefined;
  }
  const numeric = Number(port);
  return numeric >= 1 && numeric <= 65535 ? String(numeric) : undefined;
}

/**
 * Resolve the live socket to the exact saved host that created it. Paths and
 * WebSocket ports are part of that identity; a TCP alias from another entry
 * on the same hostname must never be borrowed.
 */
export function findLiveGameServer(
  connectedEndpoint: string | null | undefined,
  knownHosts: readonly GameLinkKnownHost[],
): LiveGameServer | null {
  const live = parseWebSocketEndpoint(connectedEndpoint);
  if (!live) {
    return null;
  }
  const known = knownHosts.find((candidate) => {
    const address = candidate.host.includes('/') ? candidate.host : `${candidate.host}:${candidate.port}`;
    return parseWebSocketEndpoint(`${live.protocol}//${address}`)?.href === live.href;
  });
  return {
    hostname: live.hostname,
    port: live.port || (live.protocol === 'wss:' ? '443' : '80'),
    desktopPort: validDesktopPort(known?.desktopPort),
  };
}

/** A desktop link identifies the live server only through its configured TCP alias. */
export function isSameGameServer(
  link: Pick<GameJoinLink, 'hostname' | 'port'>,
  live: LiveGameServer | null,
): boolean {
  return !!live?.desktopPort
    && isSameServerHost(link.hostname, live.hostname)
    && Number(link.port) === Number(live.desktopPort);
}
