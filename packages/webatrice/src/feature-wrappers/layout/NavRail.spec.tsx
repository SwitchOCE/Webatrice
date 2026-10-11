import { fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { PlayBadgeMode, PREFERENCE_DEFAULTS, RouteEnum } from '@app/types';

import { settingsStore } from '../../hooks/useSettings';
import NavRail from './NavRail';

interface Counts {
  rooms: Record<number, number>;
  games: Record<number, number>;
  chats: Record<string, number>;
  mentions: { rooms: Record<number, number>; games: Record<number, number> };
  notifications: number;
  total: number;
}

const NOTHING_UNREAD: Counts = {
  rooms: {}, games: {}, chats: {}, mentions: { rooms: {}, games: {} }, notifications: 0, total: 0,
};

const unread = vi.hoisted(() => ({ counts: null as unknown as Counts }));

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
  beforeEach(() => {
    unread.counts = NOTHING_UNREAD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
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

  it('badges Play with mentions only and People with unread chats by default', () => {
    unread.counts = {
      ...NOTHING_UNREAD, rooms: { 1: 2 }, games: { 3: 5 }, chats: { bob: 4 }, mentions: { rooms: { 1: 1 }, games: {} },
    };
    renderRail();

    expect(screen.getByRole('link', { name: /NavRail\.place\.play/ })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: /NavRail\.place\.people/ })).toHaveTextContent('4');
    expect(screen.getByRole('link', { name: 'NavRail.place.decks' })).not.toHaveTextContent(/\d/);
  });

  it('badges Play with all room and game activity when the setting asks for it', () => {
    vi.spyOn(settingsStore, 'peek').mockReturnValue({ ...PREFERENCE_DEFAULTS, playBadge: PlayBadgeMode.All } as never);
    unread.counts = { ...NOTHING_UNREAD, rooms: { 1: 2 }, games: { 3: 1 }, mentions: { rooms: { 1: 1 }, games: {} } };
    renderRail();

    expect(screen.getByRole('link', { name: /NavRail\.place\.play/ })).toHaveTextContent('3');
  });

  it('shows no Play badge for activity without mentions by default', () => {
    unread.counts = { ...NOTHING_UNREAD, rooms: { 1: 9 }, games: { 3: 9 } };
    renderRail();

    expect(screen.getByRole('link', { name: 'NavRail.place.play' })).not.toHaveTextContent(/\d/);
  });

  it('hides itself to a strip with a show button, keeping focus on the toggle, and comes back', () => {
    renderRail();
    const toggle = screen.getByRole('button', { name: 'NavRail.toggle.hide' });
    toggle.focus();

    fireEvent.click(toggle);

    expect(screen.queryByRole('navigation', { name: 'NavRail.label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'testUser' })).not.toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'NavRail.toggle.show' });
    expect(show).toHaveFocus();
    expect(window.localStorage.getItem('webatrice.navRailHidden')).toBe('true');

    fireEvent.click(show);

    expect(places()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NavRail.toggle.hide' })).toHaveFocus();
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
