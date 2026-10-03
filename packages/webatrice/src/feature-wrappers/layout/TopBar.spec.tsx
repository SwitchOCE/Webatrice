import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';

import { ShellLifecycleProvider, type ShellLifecycle } from './ShellLifecycleContext';
import TopBar from './TopBar';

const OWNER_KEY = 'webatrice.stickyTabs.owner';
// `${serverName}::${userName}` for connectedState.
const IDENTITY = 'Test Server::testUser';

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderTopBar(route: string = RouteEnum.SERVER) {
  const lifecycle: ShellLifecycle = { onIdentityChanged: vi.fn() };
  renderWithProviders(
    <ShellLifecycleProvider value={lifecycle}>
      <TopBar />
      <LocationProbe />
    </ShellLifecycleProvider>,
    { preloadedState: connectedState, route },
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
