import { act } from '@testing-library/react';
import { rooms } from '@cockatrice/datatrice';
import { Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';

import { connectedWithRoomsState, renderWithProviders } from '../__test-utils__';
import { notificationStore } from '@app/services';

import { settingsStore } from './useSettings';
import { useUnreadTracker } from './useUnreadTracker';
import { PREFERENCE_DEFAULTS } from '@app/types';

function Probe() {
  useUnreadTracker();
  return null;
}

const say = (message: string) => rooms.Actions.addMessage({
  roomId: 1,
  message: { name: 'otherUser', message, messageType: Event_RoomSay_RoomMessageType.UserMessage, timeReceived: 0 } as never,
});

describe('useUnreadTracker', () => {
  afterEach(() => {
    notificationStore.reset();
    vi.restoreAllMocks();
  });

  it('counts a room line that mentions you as a mention as well as unread', () => {
    const { store } = renderWithProviders(<Probe />, { preloadedState: connectedWithRoomsState, route: '/' });

    act(() => {
      store.dispatch(say('hello all'));
      store.dispatch(say('hey @testUser, ready?'));
    });

    expect(notificationStore.getState().rooms).toEqual({ 1: 2 });
    expect(notificationStore.getState().mentions.rooms).toEqual({ 1: 1 });
  });

  it('counts no mentions while mentions are switched off in chat settings', () => {
    vi.spyOn(settingsStore, 'peek').mockReturnValue({ ...PREFERENCE_DEFAULTS, chatMention: false } as never);
    const { store } = renderWithProviders(<Probe />, { preloadedState: connectedWithRoomsState, route: '/' });

    act(() => {
      store.dispatch(say('hey @testUser'));
    });

    expect(notificationStore.getState().rooms).toEqual({ 1: 1 });
    expect(notificationStore.getState().mentions.rooms).toEqual({});
  });
});
