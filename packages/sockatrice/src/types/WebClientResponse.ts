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
  getUserInfo(userInfo: ServerInfo_User): void;
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
  uploadServerDeck(path: string, treeItem: ServerInfo_DeckStorage_TreeItem): void;
  downloadServerDeck(deckId: number, response: Response_DeckDownload): void;
  createServerDeckDir(path: string, dirName: string): void;
  deleteServerDeckDir(path: string): void;
  replayList(matchList: ServerInfo_ReplayMatch[]): void;
  replayAdded(matchInfo: ServerInfo_ReplayMatch): void;
  replayModifyMatch(gameId: number, doNotHide: boolean): void;
  replayDeleteMatch(gameId: number): void;
  replayDownloaded(replayId: number, response: Response_ReplayDownload): void;

  // ── Cockatrice 3.1 protocol additions ─────────────────────────────────────
  // Optional so existing IWebClientResponse implementations keep compiling; a
  // consumer that omits one simply drops that response. 3.0 servers never
  // answer these commands successfully, so nothing reaches them there.

  /** Deck share links (#7241). */
  deckShareCreated?(response: Response_DeckShareCreate): void;
  deckShareListed?(token: string, response: Response_DeckShareList): void;
  deckShareDownloaded?(token: string, itemId: number, deck: string): void;
  deckSharesMine?(shares: ServerInfo_DeckShareSummary[]): void;
  deckShareRemoved?(shareId: number): void;
  /** Public decks (#7241). */
  otherUserDecks?(userName: string, deckList: Response_DeckList): void;
  deckVisibilityChanged?(params: DeckSetVisibilityParams): void;
  publicDeckDownloaded?(deckId: number, deck: string): void;
  /** The caller's own reports (#7091). */
  reportMyList?(reports: ServerInfo_Report[]): void;
  reportDetails?(report: ServerInfo_Report): void;
  // Command failure outcomes. `failure` is set for a transport failure (no
  // server answer) and undefined for a server-sent rejection. Optional for
  // backward compatibility with existing consumers.
  deckListFailed?(responseCode: number, failure?: CommandFailure): void;
  deckDownloadFailed?(deckId: number, responseCode: number, failure?: CommandFailure): void;
  deckUploadFailed?(path: string, responseCode: number, failure?: CommandFailure): void;
}

export interface IRoomResponse<T extends RoomEventMap = WebSocketRoomResponseOverrides> {
  clearStore(): void;
  joinRoom(roomInfo: ServerInfo_Room): void;
  leaveRoom(roomId: number): void;
  updateRooms(rooms: ServerInfo_Room[]): void;
  updateGames(roomId: number, gameList: ServerInfo_Game[]): void;
  addMessage(roomId: number, message: T[KeyOf<RoomEventMap, Event_RoomSay>]): void;
  roomSayFailed?(roomId: number, message: string, responseCode: number, failure?: CommandFailure): void;
  userJoined(roomId: number, user: ServerInfo_User): void;
  userLeft(roomId: number, name: string): void;
  removeMessages(roomId: number, name: string, amount: number): void;
  gameCreated(roomId: number): void;
  joinedGame(roomId: number, gameId: number): void;
  setJoinGamePending(pending: boolean): void;
  setJoinGameError(code: number, message: string): void;
  // Command failure outcomes; see ISessionResponse.
  joinRoomFailed?(roomId: number, responseCode: number, failure?: CommandFailure): void;
  createGameFailed?(roomId: number, responseCode: number, failure?: CommandFailure): void;
}

export interface IGameResponse {
  clearStore(): void;
  gameStateChanged(gameId: number, data: Event_GameStateChanged): void;
  playerJoined(gameId: number, playerProperties: ServerInfo_PlayerProperties): void;
  playerLeft(gameId: number, playerId: number, reason: number): void;
  playerPropertiesChanged(gameId: number, playerId: number, properties: ServerInfo_PlayerProperties): void;
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
  // Optional so existing IGameResponse implementations keep compiling.
  deckSelected?(gameId: number, deckList: string): void;
  /** Command_DeckSelect failed; `failure` is set when the server never answered (see CommandFailure). */
  deckSelectFailed?(gameId: number, responseCode: number, failure?: CommandFailure): void;
}

/** Admin commands whose non-OK response the desktop client reports to the admin. */
export type AdminCommandName =
  | 'adjustMod'
  | 'updateServerMessage'
  | 'shutdownServer'
  | 'reloadConfig';

/**
 * Moderator commands whose non-OK response the desktop client reports to the
 * moderator (a message box in user_context_menu.cpp, tab_admin.cpp, tab_logs.cpp).
 */
export type ModeratorCommandName =
  | 'banHistory'
  | 'warnHistory'
  | 'warnList'
  | 'getAdminNotes'
  | 'viewLogHistory'
  | 'grantReplayAccess'
  | 'forceActivateUser'
  | 'reportUserInfo'
  | 'getUserAlts'
  | 'getUserSessions'
  | 'getModeratorLastLogins'
  | 'removeUserAvatar'
  | 'listCardArtRules';

/** Developer commands whose failure desktop's TabDeveloper reports. */
export type DeveloperCommandName = 'getServerStats';

export interface IAdminResponse {
  /** Each flag is `undefined` when the command left that role unchanged (proto2 presence). */
  adjustMod(userName: string, shouldBeMod?: boolean, shouldBeJudge?: boolean, shouldBeDeveloper?: boolean): void;
  /**
   * A command failed; `target` names what it acted on (the user name). `failure`
   * is set when the server never answered (see CommandFailure) and undefined for
   * a server rejection. Optional for backward compatibility.
   */
  commandFailed?(command: AdminCommandName, responseCode: number, target: string, failure?: CommandFailure): void;
  reloadConfig(): void;
  shutdownServer(): void;
  updateServerMessage(): void;
}

export interface IModeratorResponse {
  banFromServer(userName: string): void;
  banHistory(userName: string, banHistory: ServerInfo_Ban[]): void;
  viewLogs(logs: ServerInfo_ChatMessage[]): void;
  warnHistory(userName: string, warnHistory: ServerInfo_Warning[]): void;
  warnListOptions(warnList: Response_WarnList[]): void;
  warnUser(userName: string): void;
  grantReplayAccess(replayId: number, moderatorName: string): void;
  forceActivateUser(usernameToActivate: string, moderatorName: string): void;
  getAdminNotes(userName: string, notes: string): void;
  updateAdminNotes(userName: string, notes: string): void;

  // ── Cockatrice 3.1 protocol additions (optional; see ISessionResponse) ────

  /** Card-art rules (#7101). */
  cardArtRules?(entries: Response_CardArtRuleEntry[]): void;
  cardArtRuleAdded?(cardName: string, cardProviderId: string, mode: string, reason: string): void;
  cardArtRuleRemoved?(cardName: string, cardProviderId: string): void;
  /** Investigation tools. */
  userSessions?(userName: string, sessions: ServerInfo_UserSession[]): void;
  userAlts?(userName: string, alts: ServerInfo_UserAlt[]): void;
  moderatorLastLogins?(logins: ServerInfo_ModeratorLogin[]): void;
  userAvatarRemoved?(userName: string): void;
  /** Moderation queue (#7091). */
  reportList?(reports: ServerInfo_Report[], totalCount: number): void;
  reportAssigned?(reportId: number): void;
  reportResolved?(reportId: number, dismissed: boolean): void;
  reportUserInfo?(info: Response_ReportUserInfo): void;
  reportStats?(stats: Response_ReportStats): void;
  replayDownloadedByGameId?(gameId: number, response: Response_ReplayDownloadByGameId): void;

  /**
   * A command failed; `target` names what it acted on (a user name, or the
   * replay id as a string). `failure` is set when the server never answered
   * (see CommandFailure) and undefined for a server rejection. Optional for
   * backward compatibility.
   */
  commandFailed?(command: ModeratorCommandName, responseCode: number, target: string, failure?: CommandFailure): void;
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
