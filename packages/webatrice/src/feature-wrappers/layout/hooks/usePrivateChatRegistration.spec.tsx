import { act, fireEvent, screen } from '@testing-library/react';
import { server } from '@cockatrice/datatrice';

import { connectedState, disconnectedState, makeUser, renderWithProviders } from '../../../__test-utils__';
import { detectTransientTab } from '../topBarTabs';
import { usePrivateChatRegistration } from './usePrivateChatRegistration';

const peer = detectTransientTab('/player/alice')!;
const tabs = [peer, detectTransientTab('/player/testUser')!, detectTransientTab('/decks')!];

function Probe() {
  const close = usePrivateChatRegistration(tabs);
  return <button onClick={() => close(peer)}>close</button>;
}

it('registers only peer chats and stops presence when an empty chat closes', () => {
  const { store } = renderWithProviders(<Probe />, { preloadedState: connectedState });
  expect(store.getState().server.messages).toEqual({ alice: [] });
  fireEvent.click(screen.getByText('close'));
  act(() => {
    store.dispatch(server.Actions.userJoined({ user: makeUser({ name: 'alice' }) }));
    store.dispatch(server.Actions.userLeft({ name: 'alice' }));
  });
  expect(store.getState().server.messages.alice).toBeUndefined();
  expect(store.getState().server.privateChatNotices.alice).toBeUndefined();
});

it('does not register chats while disconnected', () => {
  const { store } = renderWithProviders(<Probe />, { preloadedState: disconnectedState });
  expect(store.getState().server.messages).toEqual({});
});
