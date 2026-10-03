import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import {
  Response_WarnList,
  ServerInfo_Ban,
  ServerInfo_ChatMessage,
  ServerInfo_UserSchema,
  ServerInfo_User_UserLevelFlag,
  ServerInfo_Warning,
} from '@cockatrice/sockatrice/generated';
import { cloneWith, normalizeLogs } from '../../common';
import { ServerState } from './server.interfaces';

export const moderationReducers = {
  banFromServer: ((state, action) => {
    state.banUser = action.payload.userName;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string }>>,

  banHistory: ((state, action) => {
    state.banHistory[action.payload.userName] = action.payload.banHistory;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; banHistory: ServerInfo_Ban[] }>>,

  warnHistory: ((state, action) => {
    state.warnHistory[action.payload.userName] = action.payload.warnHistory;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; warnHistory: ServerInfo_Warning[] }>>,

  warnListOptions: ((state, action) => {
    state.warnListOptions = action.payload.warnList;
  }) as CaseReducer<ServerState, PayloadAction<{ warnList: Response_WarnList[] }>>,

  warnUser: ((state, action) => {
    state.warnUser = action.payload.userName;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string }>>,

  getAdminNotes: ((state, action) => {
    state.adminNotes[action.payload.userName] = action.payload.notes;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; notes: string }>>,

  updateAdminNotes: ((state, action) => {
    state.adminNotes[action.payload.userName] = action.payload.notes;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; notes: string }>>,

  // Mirrors Servatrice cmdAdjustMod: a role changes only when its flag was sent
  // (has_should_be_*); an undefined flag leaves that bit alone.
  adjustMod: ((state, action) => {
    const { userName, shouldBeMod, shouldBeJudge, shouldBeDeveloper } = action.payload;
    const user = state.users[userName];
    if (!user) {
      return;
    }
    const applyFlag = (level: number, flag: ServerInfo_User_UserLevelFlag, on: boolean | undefined): number => {
      if (on === undefined) {
        return level;
      }
      return on ? (level | flag) : (level & ~flag);
    };
    let newLevel = user.userLevel;
    newLevel = applyFlag(newLevel, ServerInfo_User_UserLevelFlag.IsModerator, shouldBeMod);
    newLevel = applyFlag(newLevel, ServerInfo_User_UserLevelFlag.IsJudge, shouldBeJudge);
    newLevel = applyFlag(newLevel, ServerInfo_User_UserLevelFlag.IsDeveloper, shouldBeDeveloper);
    // Reassign a fresh clone; Immer can't draft protobuf-es, so `user.userLevel = …` in
    // place would go untracked and the moderator badge wouldn't re-render.
    state.users[userName] = cloneWith(ServerInfo_UserSchema, user, { userLevel: newLevel });
  }) as CaseReducer<ServerState, PayloadAction<{
    userName: string;
    shouldBeMod?: boolean;
    shouldBeJudge?: boolean;
    shouldBeDeveloper?: boolean;
  }>>,

  viewLogs: ((state, action) => {
    state.logs = normalizeLogs(action.payload.logs);
  }) as CaseReducer<ServerState, PayloadAction<{ logs: ServerInfo_ChatMessage[] }>>,

  clearLogs: ((state) => {
    state.logs = { room: [], game: [], chat: [] };
  }) as CaseReducer<ServerState>,
};
