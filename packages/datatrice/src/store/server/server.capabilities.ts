/**
 * Protocol capabilities that differ between the Servatrice releases Webatrice
 * supports. Servatrice advertises no feature list to clients:
 * Event_ServerIdentification carries only `server_version`, `protocol_version`
 * (14 on both 3.0 and 3.1) and the SupportsPasswordHash bit, and Command_Login
 * feature negotiation only runs the other way (server-required client features).
 * The server's VERSION_STRING is therefore the one available signal.
 *
 * A capability names a user-facing feature family, not a command, so UI gates
 * read naturally (`supports(state, ServerCapability.REPORTS)`).
 */
export const ServerCapability = {
  /** Report a user, "my reports", report comments and REPORT_* notifications (Cockatrice #7091). */
  REPORTS: 'reports',
  /** Moderation queue and investigation tools: report list/assign/resolve/stats, user sessions/alts,
   *  moderator last logins, avatar removal, password reset, replay by game id. */
  MODERATION_TOOLS: 'moderationTools',
  /** Profile card art and moderator card-art rules (#7101). */
  CARD_ART: 'cardArt',
  /** In-game playmat independent of the deck (#7101). */
  PLAYMATS: 'playmats',
  /** Deck share links and public decks (#7241). */
  DECK_SHARING: 'deckSharing',
  /** Developer staff role: developer command family and live server metrics (#7211, #7212). */
  DEVELOPER_ROLE: 'developerRole',
} as const;

export type ServerCapability = typeof ServerCapability[keyof typeof ServerCapability];

export type ServerVersion = readonly [major: number, minor: number, patch: number];

const PROTOCOL_3_1: ServerVersion = [3, 1, 0];

const MIN_SERVER_VERSION: Record<ServerCapability, ServerVersion> = {
  [ServerCapability.REPORTS]: PROTOCOL_3_1,
  [ServerCapability.MODERATION_TOOLS]: PROTOCOL_3_1,
  [ServerCapability.CARD_ART]: PROTOCOL_3_1,
  [ServerCapability.PLAYMATS]: PROTOCOL_3_1,
  [ServerCapability.DECK_SHARING]: PROTOCOL_3_1,
  [ServerCapability.DEVELOPER_ROLE]: PROTOCOL_3_1,
};

/**
 * Parses Servatrice's VERSION_STRING, `<major>.<minor>.<patch>[-<label>] (<commit date>)`
 * (cmake/getversion.cmake). The pre-release label is ignored on purpose: a
 * `3.1.0-beta.N` server speaks the 3.1 protocol. Returns null when the string
 * does not start with a numeric triple (custom builds, not yet identified).
 */
export function parseServerVersion(version: string | null | undefined): ServerVersion | null {
  const match = /^\s*(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(version: ServerVersion, min: ServerVersion): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== min[i]) {
      return version[i] > min[i];
    }
  }
  return true;
}

/**
 * Whether a server reporting `version` offers `capability`. Unknown or
 * unparseable versions answer false, so 3.1-only actions stay hidden rather
 * than failing with RespFunctionNotAllowed / RespInvalidCommand on an older server.
 */
export function serverSupports(version: string | null | undefined, capability: ServerCapability): boolean {
  const parsed = parseServerVersion(version);
  return parsed !== null && atLeast(parsed, MIN_SERVER_VERSION[capability]);
}
