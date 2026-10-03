import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { connectedState, makeUser, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';

import { ShellLifecycleProvider, type ShellLifecycle } from './ShellLifecycleContext';
import TopBar from './TopBar';

const OWNER_KEY = 'webatrice.stickyTabs.owner';
// `${serverName}::${userName}` for connectedState.
const IDENTITY = 'Test Server::testUser';

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderTopBar(route: string = RouteEnum.SERVER, preloadedState = connectedState) {
  const lifecycle: ShellLifecycle = { onIdentityChanged: vi.fn() };
  renderWithProviders(
    <ShellLifecycleProvider value={lifecycle}>
      <TopBar />
      <LocationProbe />
    </ShellLifecycleProvider>,
    { preloadedState, route },
  );
  return lifecycle;
}

describe('TopBar shell lifecycle port', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('reports an identity change when the persisted owner is someone else', () => {
    window.localStorage.setItem(OWNER_KEY, 'Other Server::someoneElse');

    const lifecycle = renderTopBar();

    expect(lifecycle.onIdentityChanged).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(OWNER_KEY)).toBe(IDENTITY);
  });

  it('bounces off a deck route that belonged to the previous identity', () => {
    window.localStorage.setItem(OWNER_KEY, 'Other Server::someoneElse');

    renderTopBar(RouteEnum.DECKS);

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
  });

  it('does not report a change when the same identity signs in again', () => {
    window.localStorage.setItem(OWNER_KEY, IDENTITY);

    const lifecycle = renderTopBar();

    expect(lifecycle.onIdentityChanged).not.toHaveBeenCalled();
  });

  it('does not report a change on the first sign-in, and records the owner', () => {
    const lifecycle = renderTopBar();

    expect(lifecycle.onIdentityChanged).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(OWNER_KEY)).toBe(IDENTITY);
  });

  it('throws when rendered without a ShellLifecycleProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      renderWithProviders(<TopBar />, { preloadedState: connectedState, route: RouteEnum.SERVER, shellLifecycle: null }),
    ).toThrow('useShellLifecycle must be used inside <ShellLifecycleProvider>');

    consoleError.mockRestore();
  });
});

describe('TopBar user menu', () => {
  const moderatorState = {
    ...connectedState,
    server: {
      ...(connectedState.server as any),
      user: makeUser({ userLevel: Level.IsUser | Level.IsRegistered | Level.IsModerator }),
    },
  };

  const openMenuAndPick = (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'testUser' }));
    fireEvent.click(screen.getByRole('button', { name: label }));
  };

  afterEach(() => {
    window.localStorage.clear();
  });

  it('reaches Account and Settings, replacing the transient tab instead of stacking it', () => {
    renderTopBar();

    openMenuAndPick('UserMenu.account');
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.ACCOUNT);
    expect(screen.getByRole('tab', { name: /Account/ })).toHaveAttribute('aria-selected', 'true');

    openMenuAndPick('UserMenu.settings');
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SETTINGS);
    expect(screen.queryByRole('tab', { name: /Account/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Lobby|Server/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
    expect(screen.queryByRole('tab', { name: /Settings/ })).not.toBeInTheDocument();
  });

  it('offers Logs to moderators only', () => {
    renderTopBar(RouteEnum.SERVER, moderatorState);

    openMenuAndPick('UserMenu.logs');
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.LOGS);
  });

  it('hides Logs from regular users', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'testUser' }));
    expect(screen.getByRole('button', { name: 'UserMenu.account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'UserMenu.logs' })).not.toBeInTheDocument();
  });

  it('opens the card import dialog', () => {
    renderTopBar();

    openMenuAndPick('UserMenu.importCards');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
