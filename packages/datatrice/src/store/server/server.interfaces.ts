import { App, Enriched } from '../../types';
import {
  Event_NotifyUser,
  Event_ServerShutdown,
  Event_UserMessage,
  Response_CardArtRuleEntry,
  Response_DeckList,
  Response_GetServerStats,
  Response_ReportUserInfo,
  Response_WarnList,
  ServerInfo_Ban,
  ServerInfo_ChatMessage,
  ServerInfo_ModeratorLogin,
  ServerInfo_ReplayMatch,
  ServerInfo_User,
  ServerInfo_UserAlt,
  ServerInfo_UserSession,
  ServerInfo_Warning,
} from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

export type TestConnectionStatus = 'testing' | 'success' | 'failed' | null;

export interface ServerState {
  initialized: boolean;
  testConnectionStatus: TestConnectionStatus;
  buddyList: { [userName: string]: ServerInfo_User };
  ignoreList: { [userName: string]: ServerInfo_User };
  info: ServerStateInfo;
  status: ServerStateStatus;
  // Keepalive health while the socket stays open: missedPongs > 0 means the
  // server is not answering pings (lagged or unreachable); 0 = healthy. The
  // transport never self-disconnects on silence — see sockatrice KeepAliveService.
  connectionHealth: ServerConnectionHealth;
  connectUnreachable: boolean;
  // Response.ResponseCode the server rejected the last login with (e.g.
  // RespPasswordChangeRequired, RespServerFull), so the login screen can explain
  // it in the user's language; null when no login has been rejected since the
  // last connection attempt. status.description carries the English fallback.
  // Optional so ServerState objects built outside Datatrice stay valid; read it
  // through Selectors.getLoginFailureCode, which treats a missing value as null.
  loginFailureCode?: number | null;
  logs: ServerStateLogs;
  user: ServerInfo_User | null;
  users: { [userName: string]: ServerInfo_User };
  sortUsersBy: ServerStateSortUsersBy;
  // Active UI locale as a BCP-47 tag (webatrice normalizes the underscore
  // Cockatrice code via toBcp47 before dispatching setLocale). Feeds the
  // locale-aware string collation in the sorted-user/game selectors; undefined
  // means "use the environment default". Preserved across connection resets.
  locale: string | undefined;
  messages: {
    [userName: string]: Event_UserMessage[];
  };
  // Lines the client adds to a private conversation, as desktop TabMessage appends
  // them to its chat view: delivery failures and the partner's presence changes.
  // Kept beside `messages` (not inside it) so message consumers stay unchanged.
  privateChatNotices: {
    [userName: string]: PrivateChatNotice[];
  };
  userInfo: {
    [userName: string]: ServerInfo_User;
  };
  notifications: Event_NotifyUser[];
  serverShutdown: Event_ServerShutdown | null;
  banUser: string;
  banHistory: {
    [userName: string]: ServerInfo_Ban[];
  };
  warnHistory: {
    [userName: string]: ServerInfo_Warning[];
  };
  warnListOptions: Response_WarnList[];
  warnUser: string;
  adminNotes: { [userName: string]: string };
  replays: { [gameId: number]: ServerInfo_ReplayMatch };
  backendDecks: Response_DeckList | null;
  downloadedDeck: { deckId: number; deck: string } | null;
  downloadedReplay: { replayId: number; replayData: Uint8Array } | null;
  gamesOfUser: { [userName: string]: { [gameId: number]: Enriched.Game } };
  // Lifecycle of the latest Command_GetGamesOfUser per user (desktop's "Show games").
  gamesOfUserStatus: { [userName: string]: GamesOfUserStatus };
  registrationError: string | null;
  staff: ServerStateStaff;
}

// Payload of every `*Failed` command-outcome signal action.
export interface CommandFailedPayload {
  responseCode: number;
  failure?: WebsocketTypes.CommandFailure;
}

// `failed` carries the raw Response.ResponseCode, which the UI maps to desktop's
// UserContextMenu::gamesOfUserReceived message, and `failure` when the server never answered.
export type GamesOfUserStatus =
  | { state: 'loading' }
  | { state: 'loaded' }
  | ({ state: 'failed' } & CommandFailedPayload);

export type PrivateChatNoticeKind =
  | 'ignoredByRecipient'
  | 'recipientOffline'
  | 'chatFlood'
  | 'notSent'
  | 'userLeft'
  | 'userJoined';

export interface PrivateChatNotice {
  // Monotonic client id; conversation rows key on it.
  id: number;
  kind: PrivateChatNoticeKind;
  // How many of the conversation's stored messages precede this notice. Shifted
  // down when old messages are trimmed, so the notice keeps its place.
  position: number;
  // Why a `notSent` message got no answer from the server.
  failure?: WebsocketTypes.CommandFailure;
}

// One row of a private conversation: a message or a client notice, in order.
export type PrivateConversationEntry =
  | { type: 'message'; message: Event_UserMessage }
  | { type: 'notice'; notice: PrivateChatNotice };

export interface ServerStateStatus {
  connectionAttemptMade: boolean;
  description: string | null;
  state: WebsocketTypes.StatusEnum;
}

export interface ServerConnectionHealth {
  missedPongs: number;
  silentForMs: number;
}

export interface ServerStateInfo {
  message: string | null;
  name: string | null;
  version: string | null;
  /**
   * Server advertised `SupportsPasswordHash`; gates the password-check prompt on account edits.
   * `undefined` = not yet known (no identification reported it), as with a host's `supportsHashedPassword`.
   */
  supportsPasswordHash?: boolean;
}

export interface ServerStateLogs {
  room: ServerInfo_ChatMessage[];
  game: ServerInfo_ChatMessage[];
  chat: ServerInfo_ChatMessage[];
}

/** Staff tooling results: Moderation, Card Art Rules and Developer tabs. */
export interface ServerStateStaff {
  /** Moderation-tab lookups per investigated user name. */
  investigations: { [userName: string]: UserInvestigation };
  /** null until the first Command_GetModeratorLastLogins answer. */
  moderatorLastLogins: ServerInfo_ModeratorLogin[] | null;
  /** null until the first Command_ListCardArtRules answer. */
  cardArtRules: Response_CardArtRuleEntry[] | null;
  /** Latest Command_GetServerStats snapshot (developer role). */
  serverStats: Response_GetServerStats | null;
}

/** Each part is undefined until its lookup has answered. */
export interface UserInvestigation {
  info?: Response_ReportUserInfo;
  alts?: ServerInfo_UserAlt[];
  sessions?: ServerInfo_UserSession[];
}

export interface ServerStateSortUsersBy extends App.SortBy {
  field: App.UserSortField;
}
