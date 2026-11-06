import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { Actions } from './server.actions';
import { serverReducer } from './server.reducer';
import { Selectors, selectSessionEpoch } from './server.selectors';
import { makeServerState } from '../../testing/fixtures/server';

const { LOGGED_IN, CONNECTED, DISCONNECTED } = WebsocketTypes.StatusEnum;
const status = (state: WebsocketTypes.StatusEnum) => Actions.updateStatus({ status: { state, description: null } });

it('advances on each login transition, an explicit reset and a session ending', () => {
  let state = serverReducer(undefined, { type: 'init' });
  expect(selectSessionEpoch({ server: state })).toBe(0);
  state = serverReducer(state, status(LOGGED_IN));
  expect(Selectors.selectSessionEpoch({ server: state })).toBe(1);
  state = serverReducer(state, status(LOGGED_IN));
  expect(state.sessionEpoch).toBe(1);
  state = serverReducer(state, Actions.clearStore());
  expect(state.sessionEpoch).toBe(2);
  state = serverReducer(state, status(DISCONNECTED));
  state = serverReducer(state, Actions.disconnected());
  expect(state.sessionEpoch).toBe(3);
  state = serverReducer(state, status(CONNECTED));
  state = serverReducer(state, status(LOGGED_IN));
  expect(state.sessionEpoch).toBe(4);
  state = serverReducer(state, Actions.initialized());
  expect(state.sessionEpoch).toBe(4);
});

it('accepts preloaded state predating session epochs', () => {
  const state = makeServerState();
  Reflect.deleteProperty(state, 'sessionEpoch');
  expect(selectSessionEpoch({ server: state })).toBe(0);
  expect(serverReducer(state, Actions.clearStore()).sessionEpoch).toBe(1);
  expect(serverReducer(state, status(LOGGED_IN)).sessionEpoch).toBe(1);
  expect(serverReducer(state, Actions.initialized()).sessionEpoch).toBe(0);
  expect(serverReducer(state, Actions.disconnected()).sessionEpoch).toBe(0);
});

it('stays put when a socket closes with no session open, so the login page keeps its state', () => {
  let state = serverReducer(undefined, { type: 'init' });
  state = serverReducer(state, status(CONNECTED));
  state = serverReducer(state, status(DISCONNECTED));
  state = serverReducer(state, Actions.disconnected());
  state = serverReducer(state, Actions.disconnected());
  expect(state.sessionEpoch).toBe(0);
});

it('advances once when a session ends, however many disconnects follow', () => {
  let state = serverReducer(undefined, { type: 'init' });
  state = serverReducer(state, status(LOGGED_IN));
  state = serverReducer(state, status(WebsocketTypes.StatusEnum.RECONNECTING));
  state = serverReducer(state, status(DISCONNECTED));
  state = serverReducer(state, Actions.disconnected());
  expect(state.sessionEpoch).toBe(2);
  state = serverReducer(state, Actions.disconnected());
  expect(state.sessionEpoch).toBe(2);
});
