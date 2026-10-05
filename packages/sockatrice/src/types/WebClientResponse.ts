import type { RequestId } from './RequestId';

import type {
  Response_GetGamesOfUser,
  Response_DeckList,
  Response_DeckDownload,
  Response_ReplayDownload,
  Response_WarnList,
  Response_CardArtRuleEntry,
  Response_DeckShareCreate,
  Response_DeckShareList,
  Response_GetServerStats,
  Response_ReplayDownloadByGameId,
  Response_ReportStats,
  Response_ReportUserInfo,
  Event_GameLogNotice_NoticeType,
  Event_RoomSay,
  Event_GameJoined,
  Event_GameStateChanged,
  Event_MoveCard,
  Event_FlipCard,
  Event_DestroyCard,
  Event_AttachCard,
  Event_CreateToken,
  Event_SetCardAttr,
  Event_SetCardCounter,
  Event_CreateArrow,
  Event_DeleteArrow,
  Event_CreateCounter,
  Event_SetCounter,
  Event_DelCounter,
  Event_DrawCards,
  Event_RevealCards,
  Event_Shuffle,
  Event_RollDie,
  Event_DumpZone,
  Event_ChangeZoneProperties,
  Event_NotifyUser,
  Event_PlayerPropertiesChanged,
  Event_ServerShutdown,
  Event_UserMessage,
  RoomEventMap,
  ServerInfo_User,
  ServerInfo_Room,
  ServerInfo_Game,
  ServerInfo_PlayerProperties,
  ServerInfo_Ban,
  ServerInfo_ChatMessage,
  ServerInfo_Warning,
  ServerInfo_DeckStorage_TreeItem,
  ServerInfo_ReplayMatch,
  ServerInfo_Card,
  ServerInfo_DeckShareSummary,
  ServerInfo_ModeratorLogin,
  ServerInfo_Report,
  ServerInfo_UserAlt,
  ServerInfo_UserSession,
  DeckSetVisibilityParams,
} from '../generated';

import type { StatusEnum } from './StatusEnum';
import type { CommandFailure } from './CommandFailure';
import type { LatencyStats } from './LatencyStats';
import type { LoginSuccessContext, PendingActivationContext } from './SignalContexts';
import type {
  KeyOf,
  WebSocketRoomResponseOverrides,
} from './WebSocketConfig';

export interface ISessionResponse {
  initialized(): void;
  connectionAttempted(): void;
  clearStore(): void;
  loginSuccessful(options: LoginSuccessContext): void;
  /** `responseCode` is the Response.ResponseCode the server rejected the login with;
   *  undefined when the login never reached Command_Login (e.g. the salt request failed). */
  loginFailed(responseCode?: number): void;
  connectionFailed(): void;
  connectionUnreachable(): void;
  testConnectionSuccessful(supportsHashedPassword: boolean): void;
  testConnectionFailed(): void;
  updateBuddyList(buddyList: ServerInfo_User[]): void;
  addToBuddyList(user: ServerInfo_User): void;
  removeFromBuddyList(userName: string): void;
  updateIgnoreList(ignoreList: ServerInfo_User[]): void;
  addToIgnoreList(user: ServerInfo_User): void;
  removeFromIgnoreList(userName: string): void;
  /** `supportsPasswordHash` absent = capability unknown (older senders); see `server.info.supportsPasswordHash`. */
  updateInfo(name: string, version: string, supportsPasswordHash?: boolean): void;
  updateStatus(state: StatusEnum, description: string): void;
  /** Keepalive health: missedPongs > 0 while pings go unanswered, 0 on recovery.
   *  Optional for backward compatibility with existing consumers. */
  updateConnectionHealth?(missedPongs: number, silentForMs: number): void;
  /** Command round-trip stats and the rolling window (oldest first), pushed at most once a second
   *  and zeroed on disconnect (desktop `pingStatsUpdated`, #7153). Optional: additive. */
  updateLatencyStats?(stats: LatencyStats, samplesMs: number[]): void;
  updateUser(user: ServerInfo_User): void;
  updateUsers(users: ServerInfo_User[]): void;
  userJoined(user: ServerInfo_User): void;
  userLeft(userName: string): void;
  serverMessage(message: string): void;
  accountAwaitingActivation(options: PendingActivationContext): void;
  accountActivationSuccess(): void;
  /** `failure` is set when the activation got no server answer (timeout, lost connection). */
  accountActivationFailed(failure?: CommandFailure): void;
  registrationRequiresEmail(): void;
  registrationSuccess(): void;
  registrationFailed(reason: string, endTime?: number): void;
  registrationEmailError(error: string): void;
  registrationPasswordError(error: string): void;
  registrationUserNameError(error: string): void;
  resetPasswordChallenge(): void;
  resetPassword(): void;
  resetPasswordSuccess(): void;
  resetPasswordFailed(): void;
  accountPasswordChange(): void;
  accountEditChanged(realName?: string, email?: string, country?: string): void;
  accountImageChanged(avatarBmp: Uint8Array): void;
  /** Optional request identities are client-only and echoed on the matching outcome. */
  getUserInfo(userInfo: ServerInfo_User, requestId?: RequestId): void;
  /** Command_GetUserInfo for `userName` failed (e.g. RespNameNotFound for a guest who has left). */
  getUserInfoFailed?(userName: string, responseCode: number, requestId?: RequestId): void;
  getGamesOfUser(userName: string, response: Response_GetGamesOfUser): void;
  getGamesOfUserPending?(userName: string): void;
  getGamesOfUserFailed?(userName: string, responseCode: number, failure?: CommandFailure): void;
  gameJoined(gameJoinedData: Event_GameJoined): void;
  notifyUser(notification: Event_NotifyUser): void;
  playerPropertiesChanged(gameId: number, playerId: number, payload: Event_PlayerPropertiesChanged): void;
  serverShutdown(data: Event_ServerShutdown): void;
  userMessage(messageData: Event_UserMessage): void;
  privateMessageFailed?(userName: string, message: string, responseCode: number, failure?: CommandFailure): void;
  addToList(list: string, userName: string): void;
  removeFromList(list: string, userName: string): void;
  deleteServerDeck(deckId: number): void;
  updateServerDecks(deckList: Response_DeckList): void;
  uploadServerDeck(path: string, treeItem: ServerInfo_DeckStorage_TreeItem, requestId?: RequestId): void;
  updateServerDeck?(deckId: number, treeItem: ServerInfo_DeckStorage_TreeItem | undefined): void;
  updateServerDeckFailed?(deckId: number, responseCode: number, failure?: CommandFailure): void;
  downloadServerDeck(deckId: number, response: Response_DeckDownload, requestId?: RequestId): void;
  createServerDeckDir(path: string, dirName: string): void;
  deleteServerDeckDir(path: string): void;
  replayList(matchList: ServerInfo_ReplayMatch[], requestId?: RequestId): void;
  replayAdded(matchInfo: ServerInfo_ReplayMatch): void;
  replayModifyMatch(gameId: number, doNotHide: boolean): void;
  replayDeleteMatch(gameId: number): void;
  replayDownloaded(replayId: number, response: Response_ReplayDownload): void;

  // ── Cockatrice 3.1 protocol additions ─────────────────────────────────────
  // Optional so existing IWebClientResponse implementations keep compiling; a
  // consumer that omits one simply drops that response. 3.0 servers never
  // answer these commands successfully, so nothing reaches them there. A
  // refused query reaches the scope's optional commandFailed instead.

  /** Deck share links (#7241). */
  deckShareCreated?(response: Response_DeckShareCreate, requestId?: RequestId): void;
  deckShareListed?(token: string, response: Response_DeckShareList): void;
  deckShareDownloaded?(token: string, itemId: number, deck: string): void;
  deckSharesMine?(shares: ServerInfo_DeckShareSummary[]): void;
  deckShareRemoved?(shareId: number): void;
  /** Public decks (#7241). */
  otherUserDecks?(userName: string, deckList: Response_DeckList): void;
  deckVisibilityChanged?(params: DeckSetVisibilityParams): void;
  publicDeckDownloaded?(deckId: number, deck: string): void;
  /** The caller's own reports (#7091). */
  reportMyList?(reports: ServerInfo_Report[], requestId?: RequestId): void;
  reportDetails?(report: ServerInfo_Report, requestId?: RequestId): void;

  /**
   * A query above failed; `target` names what it acted on (a share token, deck,
   * share or report id as a string, a user name, or '' for a list). `failure` is
   * set when the server never answered (see CommandFailure) and undefined for a
   * server rejection; `requestId` echoes a client-only request identity.
   * Optional for backward compatibility.
   */
  commandFailed?(
    command: SessionCommandName, responseCode: number, target: string, failure?: CommandFailure, requestId?: RequestId
  ): void;

  // Command failure outcomes. `failure` is set for a transport failure (no
  // server answer) and undefined for a server-sent rejection. Optional for
  // backward compatibility with existing consumers.
  deckListFailed?(responseCode: number, failure?: CommandFailure): void;
  deckDownloadFailed?(deckId: number, responseCode: number, failure?: CommandFailure, requestId?: RequestId): void;
  deckUploadFailed?(path: string, responseCode: number, failure?: CommandFailure, requestId?: RequestId): void;
  replayListFailed?(responseCode: number, failure?: CommandFailure, requestId?: RequestId): void;
}

export interface IRoomResponse<T extends RoomEventMap = WebSocketRoomResponseOverrides> {
  clearStore(): void;
  // `userInitiated` is false for a server auto-join, which desktop opens without
  // switching to it (setCurrent = false). Optional for existing implementations.
  joinRoom(roomInfo: ServerInfo_Room, userInitiated?: boolean): void;
  leaveRoom(roomId: number): void;
  updateRooms(rooms: ServerInfo_Room[]): void;
  updateGames(roomId: number, gameList: ServerInfo_Game[]): void;
  addMessage(roomId: number, message: T[KeyOf<RoomEventMap, Event_RoomSay>]): void;
  roomSayFailed?(roomId: number, message: string, responseCode: number, failure?: CommandFailure): void;
  userJoined(roomId: number, user: ServerInfo_User): void;
  userLeft(roomId: number, name: string): void;
  removeMessages(roomId: number, name: string, amount: number): void;
  gameCreated(roomId: number): void;
  joinedGame(roomId: number, gameId: number, requestId?: RequestId): void;
  setJoinGamePending(pending: boolean, requestId?: RequestId): void;
  /** `message` is a legacy fallback; current commands send an empty string for UI translation. */
  setJoinGameError(code: number, message: string, failure?: CommandFailure, requestId?: RequestId): void;
  // Command failure outcomes; see ISessionResponse.
  /** Only a user-initiated join reports here; a failed autojoin stays silent, as on desktop. */
  /** `userInitiated` is false for an autojoin, which desktop fails silently. */
  joinRoomFailed?(roomId: number, responseCode: number, failure?: CommandFailure, userInitiated?: boolean, requestId?: RequestId): void;
  createGameFailed?(roomId: number, responseCode: number, failure?: CommandFailure, requestId?: RequestId): void;
}

export interface IGameResponse {
  clearStore(): void;
  gameStateChanged(gameId: number, data: Event_GameStateChanged): void;
  playerJoined(gameId: number, playerProperties: ServerInfo_PlayerProperties): void;
  playerLeft(gameId: number, playerId: number, reason: number): void;
  playerPropertiesChanged(gameId: number, playerId: number, properties: ServerInfo_PlayerProperties, isDeckSelect?: boolean): void;
  gameClosed(gameId: number): void;
  gameHostChanged(gameId: number, hostId: number): void;
  kicked(gameId: number): void;
  gameSay(gameId: number, playerId: number, message: string, timeReceived: number): void;
  cardMoved(gameId: number, playerId: number, data: Event_MoveCard, isUndoDraw?: boolean): void;
  cardFlipped(gameId: number, playerId: number, data: Event_FlipCard): void;
  cardDestroyed(gameId: number, playerId: number, data: Event_DestroyCard): void;
  cardAttached(gameId: number, playerId: number, data: Event_AttachCard): void;
  tokenCreated(gameId: number, playerId: number, data: Event_CreateToken): void;
  cardAttrChanged(gameId: number, playerId: number, data: Event_SetCardAttr): void;
  cardCounterChanged(gameId: number, playerId: number, data: Event_SetCardCounter): void;
  arrowCreated(gameId: number, playerId: number, data: Event_CreateArrow): void;
  arrowDeleted(gameId: number, playerId: number, data: Event_DeleteArrow): void;
  counterCreated(gameId: number, playerId: number, data: Event_CreateCounter): void;
  counterSet(gameId: number, playerId: number, data: Event_SetCounter): void;
  counterDeleted(gameId: number, playerId: number, data: Event_DelCounter): void;
  cardsDrawn(gameId: number, playerId: number, data: Event_DrawCards): void;
  cardsRevealed(gameId: number, playerId: number, data: Event_RevealCards): void;
  zoneViewRevealed(gameId: number, playerId: number, zoneName: string, cards: ServerInfo_Card[], isReversed: boolean): void;
  zoneShuffled(gameId: number, playerId: number, data: Event_Shuffle): void;
  dieRolled(gameId: number, playerId: number, data: Event_RollDie): void;
  activePlayerSet(gameId: number, activePlayerId: number): void;
  activePhaseSet(gameId: number, phase: number): void;
  turnReversed(gameId: number, reversed: boolean): void;
  zoneDumped(gameId: number, playerId: number, data: Event_DumpZone): void;
  zonePropertiesChanged(gameId: number, playerId: number, data: Event_ChangeZoneProperties): void;
  /** Event_GameLogNotice (3.1): a droppable, log-only notice about `playerId`. */
  gameLogNotice?(gameId: number, playerId: number, noticeType: Event_GameLogNotice_NoticeType): void;
  /**
   * A replay is (re)started in the local game `gameId`: create it, or reset it
   * for a rewind, from the replay's `game_info`. Raised by `WebClient.loadReplayGame`,
   * never by the server.
   */
  replayGameLoaded?(gameId: number, gameInfo: ServerInfo_Game): void;
  /** The replay played into the local game `gameId` was closed. Raised by `WebClient.unloadReplayGame`. */
  replayGameUnloaded?(gameId: number): void;
}

/**
 * Session queries (Cockatrice 3.1) whose failure the view that asked must show,
 * as desktop's deck-share and report dialogs do.
 */
export type SessionCommandName =
  | 'deckShareCreate'
  | 'deckShareList'
  | 'deckShareDownload'
  | 'deckShareListMine'
  | 'deckShareRemove'
  | 'deckListOtherUser'
  | 'deckSetVisibility'
  | 'deckDownloadPublic'
  | 'reportMyList'
  | 'reportDetails';

/** Admin commands whose non-OK response the desktop client reports to the admin. */
export type AdminCommandName =
  | 'adjustMod'
  | 'updateServerMessage'
  | 'shutdownServer'
  | 'reloadConfig';

/**
 * Moderator commands whose non-OK response the desktop client reports to the
 * moderator (a message box in user_context_menu.cpp, tab_admin.cpp, tab_logs.cpp;
 * tab_report.cpp "Failed to load reports.", "No replay available";
 * tab_moderation.cpp "Error loading user info."). `viewLogHistory` covers the
 * developer-family log lookup, whose result also lands in viewLogs.
 */
export type ModeratorCommandName =
  | 'banHistory'
  | 'warnHistory'
  | 'warnList'
  | 'getAdminNotes'
  | 'viewLogHistory'
  | 'grantReplayAccess'
  | 'forceActivateUser'
  | 'listCardArtRules'
  | 'addCardArtRule'
  | 'removeCardArtRule'
  | 'getUserSessions'
  | 'getUserAlts'
  | 'getModeratorLastLogins'
  | 'removeUserAvatar'
  | 'reportList'
  | 'reportAssign'
  | 'reportResolve'
  | 'reportUserInfo'
  | 'reportStats'
  | 'replayDownloadByGameId';

/** Developer commands whose failure desktop's TabDeveloper reports. */
export type DeveloperCommandName = 'getServerStats';

export interface IAdminResponse {
  /** Each flag is `undefined` when the command left that role unchanged (proto2 presence). */
  adjustMod(userName: string, shouldBeMod?: boolean, shouldBeJudge?: boolean, shouldBeDeveloper?: boolean, requestId?: RequestId): void;
  /**
   * A command failed; `target` names what it acted on (the user name). `failure`
   * is set when the server never answered (see CommandFailure) and undefined for
   * a server rejection. `requestId` echoes the client-only identity when supplied.
   * Optional for backward compatibility.
   */
  commandFailed?(command: AdminCommandName, responseCode: number, target: string, failure?: CommandFailure, requestId?: RequestId): void;
  reloadConfig(): void;
  shutdownServer(): void;
  updateServerMessage(): void;
}

export interface IModeratorResponse {
  banFromServer(userName: string): void;
  /** Query outcomes echo the optional client-only request identity. */
  banHistory(userName: string, banHistory: ServerInfo_Ban[], requestId?: RequestId): void;
  viewLogs(logs: ServerInfo_ChatMessage[], requestId?: RequestId): void;
  warnHistory(userName: string, warnHistory: ServerInfo_Warning[], requestId?: RequestId): void;
  warnListOptions(warnList: Response_WarnList[], requestId?: RequestId): void;
  warnUser(userName: string): void;
  grantReplayAccess(replayId: number, moderatorName: string): void;
  forceActivateUser(usernameToActivate: string, moderatorName: string): void;
  getAdminNotes(userName: string, notes: string, requestId?: RequestId): void;
  updateAdminNotes(userName: string, notes: string): void;

  // ── Cockatrice 3.1 protocol additions (optional; see ISessionResponse) ────

  /** Card-art rules (#6981). */
  cardArtRules?(entries: Response_CardArtRuleEntry[]): void;
  cardArtRuleAdded?(cardName: string, cardProviderId: string, mode: string, reason: string): void;
  cardArtRuleRemoved?(cardName: string, cardProviderId: string): void;
  /** Investigation tools. */
  userSessions?(userName: string, sessions: ServerInfo_UserSession[]): void;
  userAlts?(userName: string, alts: ServerInfo_UserAlt[]): void;
  moderatorLastLogins?(logins: ServerInfo_ModeratorLogin[]): void;
  userAvatarRemoved?(userName: string): void;
  /** Moderation queue (#7091). */
  reportList?(reports: ServerInfo_Report[], totalCount: number, requestId?: RequestId): void;
  reportAssigned?(reportId: number, requestId?: RequestId): void;
  reportResolved?(reportId: number, dismissed: boolean, requestId?: RequestId): void;
  reportUserInfo?(info: Response_ReportUserInfo, requestId?: RequestId): void;
  reportStats?(stats: Response_ReportStats, requestId?: RequestId): void;
  /** Sent before the request, so a stored replay of the same game can't stand in for the answer. */
  replayDownloadByGameIdPending?(gameId: number): void;
  replayDownloadedByGameId?(gameId: number, response: Response_ReplayDownloadByGameId, requestId?: RequestId): void;

  /**
   * A command failed; `target` names what it acted on (a user name, card name,
   * or the report, replay or game id as a string; '' for a list). `failure` is
   * set when the server never answered (see CommandFailure) and undefined for a
   * server rejection. `requestId` echoes the optional client-only identity.
   * Optional for backward compatibility.
   */
  commandFailed?(
    command: ModeratorCommandName, responseCode: number, target: string, failure?: CommandFailure, requestId?: RequestId
  ): void;
}

/** Developer staff role (#7211, #7212). Developer log lookups route to IModeratorResponse.viewLogs. */
export interface IDeveloperResponse {
  serverStats?(stats: Response_GetServerStats): void;
  /** A developer command failed; same contract as IModeratorResponse.commandFailed. */
  commandFailed?(command: DeveloperCommandName, responseCode: number, target: string, failure?: CommandFailure): void;
}

export interface IWebClientResponse<
  R extends RoomEventMap = WebSocketRoomResponseOverrides,
> {
  session: ISessionResponse;
  room: IRoomResponse<R>;
  game: IGameResponse;
  admin: IAdminResponse;
  moderator: IModeratorResponse;
  /** Optional: only consumers that surface developer tooling need it. */
  developer?: IDeveloperResponse;
}
