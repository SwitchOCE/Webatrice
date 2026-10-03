import { fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';
import { closeReplay, getOpenedReplay, getOpenedReplays, openReplay } from '@app/services';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';

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

describe('TopBar replays entry', () => {
  it('opens the replays tab from the top bar', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: /Replays/ }));

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.REPLAYS);
  });

  afterEach(() => {
    getOpenedReplays().forEach(({ key }) => closeReplay(key));
  });

  it('shows an open replay as a tab titled after it', () => {
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(`/replay/${replayKey}`);

    expect(screen.getByRole('tab', { name: /final\.cor/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the replay tab after switching to another tab, and returns to it', () => {
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(`/replay/${replayKey}`);

    fireEvent.click(screen.getByRole('tab', { name: /Lobby/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
    const replayTab = screen.getByRole('tab', { name: /final\.cor/ });
    expect(replayTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(replayTab);
    expect(screen.getByTestId('location')).toHaveTextContent(`/replay/${replayKey}`);
  });

  it('closing a replay tab closes the replay and unloads its game', () => {
    const webClient = createMockWebClient();
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', webClient);
    const { gameId } = getOpenedReplay(replayKey)!;
    renderTopBar(RouteEnum.SERVER);

    fireEvent.click(within(screen.getByRole('tab', { name: /final\.cor/ })).getByTitle('Close tab'));

    expect(screen.queryByRole('tab', { name: /final\.cor/ })).not.toBeInTheDocument();
    expect(getOpenedReplay(replayKey)).toBeUndefined();
    expect(webClient.unloadReplayGame).toHaveBeenCalledWith(gameId);
  });
});
