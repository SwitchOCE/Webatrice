import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { App } from '../../types';
import { Event_ServerShutdown } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { ServerConnectionHealth, ServerLatency, ServerState, ServerStateStatus } from './server.interfaces';
import { initialStaffState } from './server.reducer.staff';

// Healthy baseline (no missed pongs) shared by initialState, the updateStatus
// lifecycle reset, the getConnectionHealth selector fallback, and test fixtures
// so the four never drift. Never mutated in place — reducers that change health
// assign a fresh object (see connectionHealthChanged).
export const HEALTHY_CONNECTION_HEALTH: ServerConnectionHealth = {
  missedPongs: 0,
  silentForMs: 0,
};

// No samples yet: the latency display stays hidden. Shared like the health
// baseline above; latencyStatsUpdated assigns a fresh object.
export const EMPTY_LATENCY: ServerLatency = {
  stats: { lastMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, sampleCount: 0 },
  samplesMs: [],
};

export const initialState: ServerState = {
  initialized: false,
  testConnectionStatus: null,
  buddyList: {},
  ignoreList: {},

  status: {
    connectionAttemptMade: false,
    state: WebsocketTypes.StatusEnum.DISCONNECTED,
    description: null
  },
  connectionHealth: HEALTHY_CONNECTION_HEALTH,
  latency: EMPTY_LATENCY,
  connectUnreachable: false,
  loginFailureCode: null,
  info: {
    message: null,
    name: null,
    version: null
  },
  logs: {
    room: [],
    game: [],
    chat: []
  },
  user: null,
  users: {},
  sortUsersBy: {
    field: App.UserSortField.NAME,
    order: App.SortDirection.ASC
  },
  locale: undefined,
  messages: {},
  privateChatNotices: {},
  userInfo: {},
  notifications: [],
  serverShutdown: null,
  banUser: '',
  banHistory: {},
  warnHistory: {},
  warnListOptions: [],
  warnUser: '',
  adminNotes: {},
  replays: {},
  backendDecks: null,
  downloadedDeck: null,
  downloadedReplay: null,
  gamesOfUser: {},
  gamesOfUserStatus: {},
  registrationError: null,
  staff: initialStaffState,
};

export const connectionReducers = {
  // Reset reducers rebuild from initialState, which would drop the chosen UI
  // locale on connect/disconnect; carry it through so locale-aware sorting
  // survives a reconnect (see server.interfaces ServerState.locale).
  initialized: ((state) => ({
    ...initialState,
    initialized: true,
    locale: state.locale,
  })) as CaseReducer<ServerState>,

  setLocale: ((state, action) => {
    state.locale = action.payload;
  }) as CaseReducer<ServerState, PayloadAction<string | undefined>>,

  connectionAttempted: ((state) => {
    state.status.connectionAttemptMade = true;
    state.connectUnreachable = false;
    state.loginFailureCode = null;
  }) as CaseReducer<ServerState>,

  // Signal for LOGIN_FAILED effects, and the rejection code for the login screen.
  // Undefined payload = the login never got a Command_Login answer (salt request failed).
  loginFailed: ((state, action) => {
    state.loginFailureCode = action.payload?.responseCode ?? null;
  }) as CaseReducer<ServerState, PayloadAction<{ responseCode?: number } | undefined>>,

  connectUnreachable: ((state) => {
    state.connectUnreachable = true;
  }) as CaseReducer<ServerState>,

  testConnectionStarted: ((state) => {
    state.testConnectionStatus = 'testing';
    state.connectUnreachable = false;
  }) as CaseReducer<ServerState>,

  // `supportsHashedPassword` is typed on the action so `useReduxEffect`
  // subscribers (see useKnownHostsComponent) can persist it to the host
  // record in Dexie. It's deliberately not stored in redux state since
  // only the lifecycle matters here; per-host capability lives in Dexie.
  testConnectionSuccessful: ((state, _action) => {
    state.testConnectionStatus = 'success';
  }) as CaseReducer<ServerState, PayloadAction<{ supportsHashedPassword: boolean }>>,

  testConnectionFailed: ((state) => {
    state.testConnectionStatus = 'failed';
  }) as CaseReducer<ServerState>,

  // testConnectionStatus is a login-screen probe result, independent of the
  // live game socket — carry it through resets (like status/locale) so a
  // disconnect neither disables the login button (LoginForm gates on 'success')
  // nor triggers a re-probe that would count against Servatrice's per-IP
  // connection cap (security/max_users_per_address, default 4).
  clearStore: ((state) => ({
    ...initialState,
    status: { ...state.status },
    locale: state.locale,
    testConnectionStatus: state.testConnectionStatus,
  })) as CaseReducer<ServerState>,

  disconnected: ((state) => ({
    ...initialState,
    status: { ...state.status },
    locale: state.locale,
    testConnectionStatus: state.testConnectionStatus,
    // Load-bearing: the failure sets connectUnreachable just before the same-tick
    // DISCONNECTED that triggers this rebuild, so carry it or it's wiped before render.
    connectUnreachable: state.connectUnreachable,
    // Same hazard: a rejected login dispatches loginFailed between the DISCONNECTED
    // status and the socket close, whose second DISCONNECTED rebuilds the slice again.
    loginFailureCode: state.loginFailureCode,
  })) as CaseReducer<ServerState>,

  serverMessage: ((state, action) => {
    state.info.message = action.payload.message;
  }) as CaseReducer<ServerState, PayloadAction<{ message: string }>>,

  updateInfo: ((state, action) => {
    const { name, version, supportsPasswordHash } = action.payload.info;
    state.info.name = name;
    state.info.version = version;
    state.info.supportsPasswordHash = supportsPasswordHash;
  }) as CaseReducer<ServerState, PayloadAction<{ info: { name: string; version: string; supportsPasswordHash?: boolean } }>>,

  updateStatus: ((state, action) => {
    const { status } = action.payload;
    state.status.state = status.state;
    state.status.description = status.description;
    // Any status transition is a socket lifecycle change; stale degraded
    // health from the previous socket must not survive it.
    state.connectionHealth = HEALTHY_CONNECTION_HEALTH;

    if (status.state === WebsocketTypes.StatusEnum.DISCONNECTED) {
      state.status.connectionAttemptMade = false;
    }
  }) as CaseReducer<ServerState, PayloadAction<{ status: Pick<ServerStateStatus, 'state' | 'description'> }>>,

  connectionHealthChanged: ((state, action) => {
    const { missedPongs, silentForMs } = action.payload;
    state.connectionHealth = { missedPongs, silentForMs };
  }) as CaseReducer<ServerState, PayloadAction<{ missedPongs: number; silentForMs: number }>>,

  latencyStatsUpdated: ((state, action) => {
    state.latency = action.payload;
  }) as CaseReducer<ServerState, PayloadAction<ServerLatency>>,

  serverShutdown: ((state, action) => {
    state.serverShutdown = action.payload.data;
  }) as CaseReducer<ServerState, PayloadAction<{ data: Event_ServerShutdown }>>,
};
