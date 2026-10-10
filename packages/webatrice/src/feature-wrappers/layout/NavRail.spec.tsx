import { fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';

import NavRail from './NavRail';

const unread = vi.hoisted(() => ({
  counts: { rooms: {}, games: {}, chats: {}, notifications: 0, total: 0 } as {
    rooms: Record<number, number>;
    games: Record<number, number>;
    chats: Record<string, number>;
    notifications: number;
    total: number;
  },
}));

vi.mock('@app/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/hooks')>()),
  useUnreadCounts: () => unread.counts,
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderRail(route: string = RouteEnum.SERVER) {
  return renderWithProviders(<><NavRail /><LocationProbe /></>, { preloadedState: connectedState, route });
}

const places = () => screen.getByRole('navigation', { name: 'NavRail.label' });

describe('NavRail', () => {
  afterEach(() => {
    unread.counts = { rooms: {}, games: {}, chats: {}, notifications: 0, total: 0 };
  });

  it('links every place, in rail order', () => {
    renderRail();

    expect(within(places()).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      RouteEnum.SERVER, RouteEnum.DECKS, RouteEnum.REPLAYS, RouteEnum.PEOPLE, RouteEnum.SETTINGS,
    ]);
  });

  it('marks the place the current page belongs to', () => {
    renderRail('/game/4');

    expect(screen.getByRole('link', { name: 'NavRail.place.play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'NavRail.place.decks' })).not.toHaveAttribute('aria-current');
  });

  it('marks no place on a staff page', () => {
    renderRail(RouteEnum.REPORT_QUEUE);

    expect(within(places()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
  });

  it('navigates from a place', () => {
    renderRail();

    fireEvent.click(screen.getByRole('link', { name: 'NavRail.place.people' }));

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.PEOPLE);
  });

  it('badges Play with unread rooms and games and People with unread chats', () => {
    unread.counts = { rooms: { 1: 2 }, games: { 3: 1 }, chats: { bob: 4 }, notifications: 0, total: 7 };
    renderRail();

    expect(screen.getByRole('link', { name: /NavRail\.place\.play/ })).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: /NavRail\.place\.people/ })).toHaveTextContent('4');
    expect(screen.getByRole('link', { name: 'NavRail.place.decks' })).not.toHaveTextContent(/\d/);
  });

  it('shows no badge with nothing unread', () => {
    renderRail();

    expect(screen.getByRole('link', { name: 'NavRail.place.play' })).not.toHaveTextContent(/\d/);
  });

  it('opens the account menu from the avatar and reaches Shortcuts', () => {
    renderRail();

    fireEvent.click(screen.getByRole('button', { name: 'testUser' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'UserMenu.shortcuts' }));

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SHORTCUTS);
  });

  it('goes home from the logo', () => {
    renderRail(RouteEnum.DECKS);

    fireEvent.click(screen.getByRole('link', { name: 'NavRail.home' }));

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
  });
});
