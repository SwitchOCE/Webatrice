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
   *  moderator last logins, avatar removal, password reset, replay by game id (#7091). */
  MODERATION_TOOLS: 'moderationTools',
  /** Profile card art and moderator card-art rules (#6981). */
  CARD_ART: 'cardArt',
  /** In-game playmat independent of the deck (#7101). */
  PLAYMATS: 'playmats',
  /** Deck share links and public decks (#7241). */
  DECK_SHARING: 'deckSharing',
  /** Developer staff role: developer command family and live server metrics (#7211, #7212). */
  DEVELOPER_ROLE: 'developerRole',
} as const;

export type ServerCapability = typeof ServerCapability[keyof typeof ServerCapability];

export interface ServerVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /**
   * Dot-separated pre-release label, numeric parts as numbers: `['beta', 12]`
   * for `3.1.0-beta.12`, `['beta']` for the first beta. Empty for a release.
   */
  readonly prerelease: readonly (string | number)[];
}

const version = (major: number, minor: number, patch: number, ...prerelease: (string | number)[]): ServerVersion =>
  ({ major, minor, patch, prerelease });

/**
 * First Servatrice build that carries each capability: the earliest
 * `Development-3.1.0-beta.N` tag containing the feature's protocol. 3.1 betas
 * share one protocol_version, so the beta number is the only way to tell a
 * beta.7 server (no reports) from a beta.8 one.
 */
const MIN_SERVER_VERSION: Record<ServerCapability, ServerVersion> = {
  [ServerCapability.CARD_ART]: version(3, 1, 0, 'beta', 2),
  [ServerCapability.REPORTS]: version(3, 1, 0, 'beta', 8),
  [ServerCapability.MODERATION_TOOLS]: version(3, 1, 0, 'beta', 8),
  [ServerCapability.PLAYMATS]: version(3, 1, 0, 'beta', 8),
  [ServerCapability.DEVELOPER_ROLE]: version(3, 1, 0, 'beta', 12),
  [ServerCapability.DECK_SHARING]: version(3, 1, 0, 'beta', 13),
};

/**
 * Parses Servatrice's VERSION_STRING, `<major>.<minor>.<patch>[-<label>] (<commit date>)`
 * (cmake/getversion.cmake). Development tags give the label `beta` (first beta)
 * or `beta.N`; releases and untagged source builds have none. Returns null when
 * the string does not start with a numeric triple (custom builds, not yet identified).
 */
export function parseServerVersion(raw: string | null | undefined): ServerVersion | null {
  const match = /^\s*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw ?? '');
  if (!match) {
    return null;
  }
  const prerelease = match[4]
    ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];
  return version(Number(match[1]), Number(match[2]), Number(match[3]), ...prerelease);
}

/** Orders pre-release labels like semver: a release outranks any pre-release, `beta` < `beta.2` < `beta.10`. */
function comparePrerelease(a: ServerVersion['prerelease'], b: ServerVersion['prerelease']): number {
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) {
      continue;
    }
    if (typeof x === 'number' && typeof y === 'number') {
      return x - y;
    }
    if (typeof x === 'number') {
      return -1;
    }
    if (typeof y === 'number') {
      return 1;
    }
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

function atLeast(actual: ServerVersion, min: ServerVersion): boolean {
  const core = (actual.major - min.major) || (actual.minor - min.minor) || (actual.patch - min.patch);
  return core !== 0 ? core > 0 : comparePrerelease(actual.prerelease, min.prerelease) >= 0;
}

/**
 * Whether a server reporting `version` offers `capability`. Unknown or
 * unparseable versions answer false, so 3.1-only actions stay hidden rather
 * than failing with RespFunctionNotAllowed / RespInvalidCommand on an older server.
 */
export function serverSupports(raw: string | null | undefined, capability: ServerCapability): boolean {
  const parsed = parseServerVersion(raw);
  return parsed !== null && atLeast(parsed, MIN_SERVER_VERSION[capability]);
}
