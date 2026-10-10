import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { rooms } from '@cockatrice/datatrice';
import { Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';

import { connectedWithRoomsState, renderWithProviders } from '../../__test-utils__';
import NotificationBell from './NotificationBell';
import NotificationCentre from './NotificationCentre';
import { logNotification, notificationStore } from './notificationStore';

function renderCentre(route = '/') {
  return renderWithProviders(
    <>
      <NotificationBell />
      <NotificationCentre />
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/room/:roomId" element={<p>room page</p>} />
        <Route path="/game/:gameId" element={<p>game page</p>} />
        <Route path="/player/:name" element={<p>chat page</p>} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </>,
    { preloadedState: connectedWithRoomsState, route },
  );
}

const bell = () => screen.getByRole('button', { name: /^Notifications\.bell/ });
const drawer = () => screen.getByRole('complementary', { name: 'Notifications.drawer.title' });

describe('NotificationBell and NotificationCentre', () => {
  beforeEach(() => {
    notificationStore.reset();
  });

  it('counts unread entries on the bell and opens the session log from it', () => {
    renderCentre();
    expect(bell()).toHaveAccessibleName('Notifications.bell.label');
    act(() => {
      logNotification({ kind: 'message', actor: 'bob', body: 'hi', target: { type: 'chat', userName: 'bob' } });
      logNotification({ kind: 'game', place: 'Pod', seats: { taken: 4, max: 4 }, target: { type: 'game', gameId: 7 } }, true);
    });
    expect(bell()).toHaveAccessibleName('Notifications.bell.labelUnread');
    expect(bell().parentElement).toHaveTextContent('1');

    fireEvent.click(bell());

    expect(bell()).toHaveAttribute('aria-expanded', 'true');
    const panel = within(drawer());
    expect(panel.getByRole('region', { name: 'Notifications.drawer.sectionNew' })).toHaveTextContent('bob');
    expect(panel.getByRole('region', { name: 'Notifications.drawer.sectionEarlier' })).toHaveTextContent('Notifications.title.game');
  });

  it('filters by kind and runs one action per entry, marking it read and closing the drawer', () => {
    renderCentre();
    act(() => {
      logNotification({ kind: 'message', actor: 'bob', body: 'hi', target: { type: 'chat', userName: 'bob' } });
      logNotification({ kind: 'mention', actor: 'amy', place: 'Magic', target: { type: 'room', roomId: 1 } });
    });
    fireEvent.click(bell());

    fireEvent.click(within(drawer()).getByRole('button', { name: /Notifications\.filter\.mention/ }));
    expect(within(drawer()).queryByText('bob')).not.toBeInTheDocument();

    fireEvent.click(within(drawer()).getByRole('button', { name: 'Notifications.action.mention' }));

    expect(screen.getByText('room page')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(notificationStore.getState().entries.map((entry) => entry.read)).toEqual([true, false]);
  });

  it('marks everything read and closes on Escape', () => {
    renderCentre();
    act(() => {
      logNotification({ kind: 'report', title: 'Report resolved', target: { type: 'route', path: '/settings' } });
    });
    fireEvent.click(bell());

    fireEvent.click(within(drawer()).getByRole('button', { name: 'Notifications.drawer.markAllRead' }));
    expect(bell()).toHaveAccessibleName('Notifications.bell.label');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows an empty state and links to the notification settings', () => {
    renderCentre();
    fireEvent.click(bell());
    expect(within(drawer()).getByText('Notifications.drawer.empty')).toBeInTheDocument();

    fireEvent.click(within(drawer()).getByRole('button', { name: 'Notifications.drawer.settings' }));
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });

  it('counts unread room lines while elsewhere and clears them when the room is shown', () => {
    const { store } = renderCentre();
    act(() => {
      store.dispatch(rooms.Actions.addMessage({
        roomId: 1,
        message: { name: 'otherUser', message: 'hello', messageType: Event_RoomSay_RoomMessageType.UserMessage, timeReceived: 0 } as never,
      }));
    });
    expect(notificationStore.getState().rooms).toEqual({ 1: 1 });

    act(() => {
      logNotification({ kind: 'mention', actor: 'amy', target: { type: 'room', roomId: 1 } });
    });
    fireEvent.click(bell());
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Notifications.action.mention' }));

    expect(notificationStore.getState().rooms).toEqual({});
  });
});
