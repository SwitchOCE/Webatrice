import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { WebClientContext } from '@cockatrice/datatrice/react';
import { server } from '@cockatrice/datatrice';
import { ServerInfo_ReplayMatchSchema, ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { endSession } from '@app/services/session';
import { connectedState, createMockWebClient, makeStoreState, makeUser, renderWithProviders } from '../../__test-utils__';
import { useServerReplays, type ServerReplays } from './useServerReplays';

const match = (gameId: number) => create(ServerInfo_ReplayMatchSchema, { gameId, gameName: `Game ${gameId}`, doNotHide: false });

function setup() {
  let model: ServerReplays;
  let client = createMockWebClient();
  function Probe() {
    model = useServerReplays();
    return null;
  }
  const ui = () => <WebClientContext.Provider value={client}><Probe /></WebClientContext.Provider>;
  const view = renderWithProviders(ui(), {
    preloadedState: makeStoreState({
      ...connectedState,
      server: {
        ...connectedState.server,
        user: makeUser({ userLevel: ServerInfo_User_UserLevelFlag.IsUser | ServerInfo_User_UserLevelFlag.IsRegistered }),
      },
    }),
    webClient: client,
  });
  return {
    ...view,
    get model() {
      return model!;
    },
    requestId: () => vi.mocked(client.request.session.replayList).mock.lastCall?.[0],
    requestCount: () => vi.mocked(client.request.session.replayList).mock.calls.length,
    // Replacing the context client re-runs the hook's refresh without remounting it.
    refresh: () => {
      client = createMockWebClient();
      view.rerender(ui());
    },
    succeed: (requestId: string | undefined, gameId: number) => act(() => {
      view.store.dispatch(server.Actions.replayList({ matchList: [match(gameId)], requestId }));
    }),
    fail: (requestId: string | undefined) => act(() => {
      view.store.dispatch(server.Actions.replayListFailed({
        responseCode: -1, failure: WebsocketTypes.CommandFailure.Timeout, requestId,
      }));
    }),
  };
}

describe('server replay refresh ownership', () => {
  it('lets only the newest refresh end the loading state', () => {
    const view = setup();
    const first = view.requestId();
    view.refresh();
    const second = view.requestId();

    view.succeed(first, 1);
    expect(view.model.loading).toBe(true);

    view.succeed(second, 2);
    expect(view.model.loading).toBe(false);
  });

  it.each([false, true])('ignores a stale failure when the newer refresh has settled: %s', (settled) => {
    const view = setup();
    const first = view.requestId();
    view.refresh();
    const second = view.requestId();
    if (settled) {
      view.succeed(second, 2);
    }

    view.fail(first);

    expect(view.model.notice).toBeNull();
    expect(view.model.loading).toBe(!settled);
  });

  it('settles the current failure once and rejects later outcomes for that request', () => {
    const view = setup();
    const requestId = view.requestId();
    expect(requestId).toEqual(expect.any(String));
    view.fail(requestId);
    expect(view.model.loading).toBe(false);
    expect(view.model.notice?.message).toBe('CommandFailure.timeout');
    act(() => view.model.dismissNotice());
    view.fail(requestId);
    expect(view.model.notice).toBeNull();
  });

  it('raises no notice for a refresh that outlived its session', () => {
    const view = setup();
    const requestId = view.requestId();
    act(() => endSession());
    view.fail(requestId);
    expect(view.model.notice).toBeNull();
  });
});
