import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { create } from '@bufbuild/protobuf';
import { Enriched } from '../../types';
import {
  Event_NotifyUser,
  Event_UserMessage,
  Response_GetGamesOfUser,
  Response_ResponseCode,
  ServerInfo_User,
  ServerInfo_UserSchema,
} from '@cockatrice/sockatrice/generated';
import { normalizeGameObject, normalizeGametypeMap } from '../../common';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { CommandFailedPayload, PrivateChatNoticeKind, ServerState } from './server.interfaces';

export const MAX_USER_MESSAGES = 1000;
export const MAX_NOTIFICATIONS = 200;
export const MAX_PRIVATE_CHAT_NOTICES = 200;

// Monotonic, session-scoped id for private-chat notices (rows key on it).
let nextNoticeId = 0;

// Command_Message rejections desktop TabMessage::messageSent reports, plus the
// flood rejection Servatrice's cmdMessage also returns.
const PRIVATE_MESSAGE_FAILURE_NOTICES: Partial<Record<Response_ResponseCode, PrivateChatNoticeKind>> = {
  [Response_ResponseCode.RespInIgnoreList]: 'ignoredByRecipient',
  [Response_ResponseCode.RespNameNotFound]: 'recipientOffline',
  [Response_ResponseCode.RespChatFlood]: 'chatFlood',
};

function hasConversation(state: ServerState, userName: string): boolean {
  return Boolean(state.messages[userName] || state.privateChatNotices[userName]);
}

function appendPrivateChatNotice(
  state: ServerState,
  userName: string,
  kind: PrivateChatNoticeKind,
  failure?: WebsocketTypes.CommandFailure,
): void {
  const notices = state.privateChatNotices[userName] ?? [];
  const position = state.messages[userName]?.length ?? 0;
  const kept = notices.length >= MAX_PRIVATE_CHAT_NOTICES
    ? notices.slice(notices.length - MAX_PRIVATE_CHAT_NOTICES + 1)
    : notices;
  state.privateChatNotices[userName] = [...kept, { id: nextNoticeId++, kind, position, ...(failure ? { failure } : {}) }];
}

export const userReducers = {
  updateUser: ((state, action) => {
    if (state.user) {
      state.user = create(ServerInfo_UserSchema, { ...state.user, ...action.payload.user });
    } else {
      state.user = action.payload.user as ServerInfo_User;
    }
  }) as CaseReducer<ServerState, PayloadAction<{ user: Partial<ServerInfo_User> }>>,

  updateUsers: ((state, action) => {
    const users: { [userName: string]: ServerInfo_User } = {};
    for (const user of action.payload.users) {
      users[user.name] = user;
    }
    state.users = users;
  }) as CaseReducer<ServerState, PayloadAction<{ users: ServerInfo_User[] }>>,

  // An open conversation records the partner coming online or going offline, as
  // desktop TabMessage::processUserJoined / processUserLeft append to the chat.
  userJoined: ((state, action) => {
    const { user } = action.payload;
    state.users[user.name] = user;
    if (hasConversation(state, user.name)) {
      appendPrivateChatNotice(state, user.name, 'userJoined');
    }
  }) as CaseReducer<ServerState, PayloadAction<{ user: ServerInfo_User }>>,

  userLeft: ((state, action) => {
    const { name } = action.payload;
    delete state.users[name];
    if (hasConversation(state, name)) {
      appendPrivateChatNotice(state, name, 'userLeft');
    }
  }) as CaseReducer<ServerState, PayloadAction<{ name: string }>>,

  getUserInfo: ((state, action) => {
    const { userInfo } = action.payload;
    state.userInfo[userInfo.name] = userInfo;
  }) as CaseReducer<ServerState, PayloadAction<{ userInfo: ServerInfo_User }>>,

  userMessage: ((state, action) => {
    if (!state.user) {
      return;
    }
    const { senderName, receiverName } = action.payload.messageData;
    const userName = state.user.name === senderName ? receiverName : senderName;
    if (!state.messages[userName]) {
      state.messages[userName] = [];
    }
    const msgs = state.messages[userName];
    if (msgs.length >= MAX_USER_MESSAGES) {
      const trimmed = msgs.length - MAX_USER_MESSAGES + 1;
      state.messages[userName] = msgs.slice(trimmed);
      // Keep each notice beside the messages it followed; drop those that
      // preceded only trimmed messages.
      const notices = state.privateChatNotices[userName];
      if (notices) {
        state.privateChatNotices[userName] = notices
          .filter((notice) => notice.position >= trimmed)
          .map((notice) => ({ ...notice, position: notice.position - trimmed }));
      }
    }
    state.messages[userName].push(action.payload.messageData);
  }) as CaseReducer<ServerState, PayloadAction<{ messageData: Event_UserMessage }>>,

  // A Command_Message that failed: rejected by the server, or never answered
  // (`failure` set: a "not sent" notice with the reason). `message` is the unsent
  // text: the reducer records only the notice; the UI may use it to restore the draft.
  privateMessageFailed: ((state, action) => {
    const { userName, responseCode, failure } = action.payload;
    if (failure) {
      appendPrivateChatNotice(state, userName, 'notSent', failure);
      return;
    }
    const kind = PRIVATE_MESSAGE_FAILURE_NOTICES[responseCode as Response_ResponseCode];
    if (kind) {
      appendPrivateChatNotice(state, userName, kind);
    }
  }) as CaseReducer<ServerState, PayloadAction<CommandFailedPayload & { userName: string; message: string }>>,

  notifyUser: ((state, action) => {
    if (state.notifications.length >= MAX_NOTIFICATIONS) {
      state.notifications = state.notifications.slice(
        state.notifications.length - MAX_NOTIFICATIONS + 1
      );
    }
    state.notifications.push(action.payload.notification);
  }) as CaseReducer<ServerState, PayloadAction<{ notification: Event_NotifyUser }>>,

  // A fresh request drops the previous answer so a stale list never shows as current.
  gamesOfUserRequested: ((state, action) => {
    const { userName } = action.payload;
    delete state.gamesOfUser[userName];
    state.gamesOfUserStatus[userName] = { state: 'loading' };
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string }>>,

  gamesOfUser: ((state, action) => {
    const { userName, response } = action.payload;
    // Game type ids are scoped to their room, so each game resolves its type
    // through its own room's list (desktop keys gameTypeMap by room id).
    const gametypeMaps: { [roomId: number]: Enriched.GametypeMap } = {};
    for (const room of response.roomList ?? []) {
      gametypeMaps[room.roomId] = normalizeGametypeMap(room.gametypeList ?? []);
    }
    const games: { [gameId: number]: Enriched.Game } = {};
    for (const g of response.gameList ?? []) {
      const normalized = normalizeGameObject(g, gametypeMaps[g.roomId] ?? {});
      games[normalized.info.gameId] = normalized;
    }
    state.gamesOfUser[userName] = games;
    state.gamesOfUserStatus[userName] = { state: 'loaded' };
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; response: Response_GetGamesOfUser }>>,

  gamesOfUserFailed: ((state, action) => {
    const { userName, responseCode, failure } = action.payload;
    state.gamesOfUserStatus[userName] = { state: 'failed', responseCode, failure };
  }) as CaseReducer<ServerState, PayloadAction<CommandFailedPayload & { userName: string }>>,
};
