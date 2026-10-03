import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { create } from '@bufbuild/protobuf';
import {
  Response_CardArtRuleEntry,
  Response_CardArtRuleEntrySchema,
  Response_GetServerStats,
  Response_ReportUserInfo,
  ServerInfo_ModeratorLogin,
  ServerInfo_UserAlt,
  ServerInfo_UserSchema,
  ServerInfo_UserSession,
} from '@cockatrice/sockatrice/generated';
import { cloneWith } from '../../common';
import { ServerState, ServerStateStaff, UserInvestigation } from './server.interfaces';

// Staff tooling results (desktop TabModeration, TabCardArtRules, TabDeveloper).
// Each list starts as null ("never loaded") so a view can tell an empty answer
// from one that has not arrived yet.
export const initialStaffState: ServerStateStaff = {
  investigations: {},
  moderatorLastLogins: null,
  cardArtRules: null,
  serverStats: null,
};


const sameRule = (cardName: string, cardProviderId: string) => (entry: Response_CardArtRuleEntry): boolean =>
  entry.cardName === cardName && entry.cardProviderId === cardProviderId;

function investigation(state: ServerState, userName: string): UserInvestigation {
  state.staff.investigations[userName] ??= {};
  return state.staff.investigations[userName];
}

export const staffReducers = {
  // Keyed by the name the server echoes (Servatrice copies the requested user_name).
  userInfoReport: ((state, action) => {
    investigation(state, action.payload.info.userName).info = action.payload.info;
  }) as CaseReducer<ServerState, PayloadAction<{ info: Response_ReportUserInfo }>>,

  userAlts: ((state, action) => {
    investigation(state, action.payload.userName).alts = action.payload.alts;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; alts: ServerInfo_UserAlt[] }>>,

  userSessions: ((state, action) => {
    investigation(state, action.payload.userName).sessions = action.payload.sessions;
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string; sessions: ServerInfo_UserSession[] }>>,

  moderatorLastLogins: ((state, action) => {
    state.staff.moderatorLastLogins = action.payload.logins;
  }) as CaseReducer<ServerState, PayloadAction<{ logins: ServerInfo_ModeratorLogin[] }>>,

  // The avatar is gone server-side; drop any cached copy so profile views stop
  // showing it. Fresh clones, since Immer can't draft protobuf-es messages.
  userAvatarRemoved: ((state, action) => {
    const { userName } = action.payload;
    const noAvatar = { avatarBmp: new Uint8Array() };
    if (state.users[userName]) {
      state.users[userName] = cloneWith(ServerInfo_UserSchema, state.users[userName], noAvatar);
    }
    if (state.userInfo[userName]) {
      state.userInfo[userName] = cloneWith(ServerInfo_UserSchema, state.userInfo[userName], noAvatar);
    }
  }) as CaseReducer<ServerState, PayloadAction<{ userName: string }>>,

  cardArtRules: ((state, action) => {
    state.staff.cardArtRules = action.payload.entries;
  }) as CaseReducer<ServerState, PayloadAction<{ entries: Response_CardArtRuleEntry[] }>>,

  // A rule is identified by (card, provider id): adding an existing pair replaces it.
  cardArtRuleAdded: ((state, action) => {
    const rules = state.staff.cardArtRules;
    if (!rules) {
      return;
    }
    const { cardName, cardProviderId, mode, reason } = action.payload;
    const entry = create(Response_CardArtRuleEntrySchema, { cardName, cardProviderId, mode, reason });
    const index = rules.findIndex(sameRule(cardName, cardProviderId));
    if (index === -1) {
      rules.push(entry);
    } else {
      rules[index] = entry;
    }
  }) as CaseReducer<ServerState, PayloadAction<{ cardName: string; cardProviderId: string; mode: string; reason: string }>>,

  cardArtRuleRemoved: ((state, action) => {
    const rules = state.staff.cardArtRules;
    if (!rules) {
      return;
    }
    const { cardName, cardProviderId } = action.payload;
    state.staff.cardArtRules = rules.filter((entry) => !sameRule(cardName, cardProviderId)(entry));
  }) as CaseReducer<ServerState, PayloadAction<{ cardName: string; cardProviderId: string }>>,

  serverStats: ((state, action) => {
    state.staff.serverStats = action.payload.stats;
  }) as CaseReducer<ServerState, PayloadAction<{ stats: Response_GetServerStats }>>,
};
