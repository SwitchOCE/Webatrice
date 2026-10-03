import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { server } from '@cockatrice/datatrice';
import { Response_DeckShareCreateSchema } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { connected31State, connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { useDeckShareCreate, useDeckSharingSupported, useDeckVisibility } from './useDeckSharing';

const knownHosts = vi.hoisted(() => ({ selectedHost: { host: 'server.example', port: '4748' } as object | undefined }));
vi.mock('@app/feature-widgets/known-hosts', () => ({
  useKnownHosts: () => ({ status: 'loaded', value: { hosts: [], selectedHost: knownHosts.selectedHost } }),
}));

let create$: ReturnType<typeof useDeckShareCreate>;
let visibility: ReturnType<typeof useDeckVisibility>;
let supported: boolean;
function Probe() {
  create$ = useDeckShareCreate();
  visibility = useDeckVisibility();
  supported = useDeckSharingSupported();
  return null;
}

function setup(preloadedState = connected31State) {
  const webClient = createMockWebClient();
  const { store } = renderWithProviders(<Probe />, { preloadedState, webClient });
  return { webClient, store };
}

const writeText = vi.fn();
beforeEach(() => {
  knownHosts.selectedHost = { host: 'server.example', port: '4748' };
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('useDeckSharingSupported', () => {
  it('follows the server version', () => {
    setup();
    expect(supported).toBe(true);
    setup(connectedState);
    expect(supported).toBe(false);
  });
});

describe('useDeckShareCreate', () => {
  it('sends the share, then builds the link to this page and copies it', async () => {
    const { webClient, store } = setup();
    act(() => create$.create({ name: 'Shared decks', folderPath: 'Cube' }));
    expect(webClient.request.session.deckShareCreate).toHaveBeenCalledWith({ name: 'Shared decks', folderPath: 'Cube' });
    expect(create$.state).toEqual({ status: 'pending' });

    const share = create(Response_DeckShareCreateSchema, { token: 'tok', expiresAt: 1800000000n, itemCount: 3 });
    await act(async () => {
      store.dispatch(server.Actions.deckShareCreated({ share }));
    });
    const link = new URL(window.location.href);
    link.search = '';
    link.hash = 'share=tok&hostname=server.example&port=4748';
    expect(create$.state).toEqual({
      status: 'created', link: link.toString(), expiresAt: 1800000000n, itemCount: 3, copied: true,
    });
    expect(writeText).toHaveBeenCalledWith(link.toString());
  });

  it('shows the link without "copied" when the browser refuses the clipboard', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { store } = setup();
    act(() => create$.create({ name: 'x', items: [{ deckId: 1 }] }));
    await act(async () => {
      store.dispatch(server.Actions.deckShareCreated({ share: create(Response_DeckShareCreateSchema, { token: 't' }) }));
    });
    expect(create$.state).toMatchObject({ status: 'created', copied: false });
  });

  it('refuses to make a link that names no server', () => {
    knownHosts.selectedHost = undefined;
    const { webClient } = setup();
    act(() => create$.create({ name: 'x', items: [{ deckId: 1 }] }));
    expect(webClient.request.session.deckShareCreate).not.toHaveBeenCalled();
    expect(create$.state).toEqual({ status: 'failed', message: 'DeckSharing.noServer' });
  });

  it('drops an answer that arrives after a reset', async () => {
    const { store } = setup();
    act(() => create$.create({ name: 'x', items: [{ deckId: 1 }] }));
    act(() => create$.reset());
    await act(async () => {
      store.dispatch(server.Actions.deckShareCreated({ share: create(Response_DeckShareCreateSchema, { token: 't' }) }));
    });
    expect(create$.state).toEqual({ status: 'idle' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('ignores a share it did not ask for', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.deckShareCreated({ share: create(Response_DeckShareCreateSchema, { token: 't' }) }));
    });
    expect(create$.state).toEqual({ status: 'idle' });
  });

  it('reports desktop\'s failure with the response code, or the transport reason', () => {
    const { store } = setup();
    act(() => create$.create({ name: 'x', items: [{ deckId: 1 }] }));
    act(() => {
      store.dispatch(server.Actions.sessionCommandFailed({ command: 'deckShareCreate', target: '', responseCode: 11 }));
    });
    expect(create$.state).toEqual({ status: 'failed', message: 'DeckSharing.createFailed' });

    act(() => create$.create({ name: 'x', items: [{ deckId: 1 }] }));
    act(() => {
      store.dispatch(server.Actions.sessionCommandFailed({
        command: 'deckShareCreate', target: '', responseCode: -1, failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });
    expect(create$.state).toMatchObject({ status: 'failed' });
    expect(create$.state).not.toEqual({ status: 'failed', message: 'DeckSharing.createFailed' });
  });

  it('sends one request at a time', () => {
    const { webClient } = setup();
    act(() => create$.create({ name: 'a', items: [{ deckId: 1 }] }));
    act(() => create$.create({ name: 'b', items: [{ deckId: 1 }] }));
    expect(webClient.request.session.deckShareCreate).toHaveBeenCalledTimes(1);
  });
});

describe('useDeckVisibility', () => {
  it('flips the node\'s own bit: public → private, private or inherited → public', () => {
    const { webClient } = setup();
    act(() => visibility.toggle({ deckId: 4 }, 'public'));
    act(() => visibility.toggle({ folderPath: 'Cube' }, 'inherited'));
    act(() => visibility.toggle({ deckId: 5 }, 'private'));
    expect(vi.mocked(webClient.request.session.deckSetVisibility).mock.calls).toEqual([
      [{ deckId: 4, isPublic: false }],
      [{ folderPath: 'Cube', isPublic: true }],
      [{ deckId: 5, isPublic: true }],
    ]);
  });

  it('reports a rejected change until dismissed', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.sessionCommandFailed({ command: 'deckSetVisibility', target: '4', responseCode: 11 }));
    });
    expect(visibility.error).toBe('DeckSharing.visibilityFailed');
    act(() => visibility.clearError());
    expect(visibility.error).toBeNull();
  });

  it('ignores other commands\' failures', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.sessionCommandFailed({ command: 'deckShareList', target: 't', responseCode: 11 }));
    });
    expect(visibility.error).toBeNull();
  });
});
