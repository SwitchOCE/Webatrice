import { fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';
import { closeReplay, getOpenedReplay, getOpenedReplays, openReplay } from '@app/services';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';

import TopBar from './TopBar';

const TABS_KEY = 'webatrice.stickyTabs';
const OWNER_KEY = 'webatrice.stickyTabs.owner';
// `${serverName}::${userName}` for connectedState.
const IDENTITY = 'Test Server::testUser';

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderTopBar(route: string = RouteEnum.SERVER, preloadedState = connectedState) {
  return renderWithProviders(
    <>
      <TopBar />
      <LocationProbe />
    </>,
    { preloadedState, route },
  );
}

describe('TopBar identity changes', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it.each(['/decks', '/deck/1', '/deck/draft/old'])(
    'strips persisted deck tabs and redirects from %s for a different identity', (route) => {
      renderTopBar(RouteEnum.DECKS).unmount();
      renderTopBar('/deck/1').unmount();
      expect(JSON.parse(window.localStorage.getItem(TABS_KEY)!)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'decks' }),
        expect.objectContaining({ type: 'deck' }),
      ]));
      window.localStorage.setItem(OWNER_KEY, 'Other Server::someoneElse');

      renderTopBar(route);

      expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
      expect(JSON.parse(window.localStorage.getItem(TABS_KEY)!)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'deck' }),
      ]));
      expect(JSON.parse(window.localStorage.getItem(TABS_KEY)!)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'decks' }),
      ]));
      expect(window.localStorage.getItem(OWNER_KEY)).toBe(IDENTITY);
    },
  );

  it('keeps the deck tab and route when the same identity signs in again', () => {
    window.localStorage.setItem(OWNER_KEY, IDENTITY);

    renderTopBar('/deck/1');

    expect(screen.getByTestId('location')).toHaveTextContent('/deck/1');
    expect(JSON.parse(window.localStorage.getItem(TABS_KEY)!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'deck', route: '/deck/1' }),
    ]));
  });

  it('records the owner on the first sign-in', () => {
    renderTopBar();

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
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
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

  it('gives an unsaved deck draft the deck editor tab', () => {
    renderTopBar('/deck/draft/abc');

    expect(screen.getByRole('tab', { name: /Unsaved deck/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /Lobby|Server/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Unsaved deck/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/deck/draft/abc');
  });

  it('offers Logs to moderators only', () => {
    renderTopBar(RouteEnum.SERVER, moderatorState);

    openMenuAndPick('UserMenu.logs');
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.LOGS);
  });

  it('hides Logs from regular users', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'testUser' }));
    expect(screen.getByRole('menuitem', { name: 'UserMenu.account' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'UserMenu.logs' })).not.toBeInTheDocument();
  });

  it('opens the card import dialog', () => {
    renderTopBar();

    openMenuAndPick('UserMenu.importCards');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens the debug log', () => {
    renderTopBar();

    openMenuAndPick('UserMenu.debugLog');
    expect(screen.getByRole('dialog', { name: /DebugLogDialog\.title/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'TopBar.user.signOut' })).not.toBeInTheDocument();
  });
});

describe('TopBar replays entry', () => {
  it('opens the replays tab from the top bar', () => {
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'TopBar.replays.button' }));

    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.REPLAYS);
    expect(screen.getByRole('tab', { name: 'TopBar.replays.tab' })).toHaveAttribute('aria-selected', 'true');
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

describe('TopBar report entries (#7091)', () => {
  function renderAs(version: string, userLevel: number) {
    renderTopBar(RouteEnum.SERVER, {
      ...connectedState,
      server: {
        ...(connectedState.server as any),
        info: { message: null, name: 'Test Server', version },
        user: makeUser({ userLevel }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'testUser' }));
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows My Reports to a registered user on 3.1 and opens it in a tab', () => {
    renderAs('3.1.0 ()', Level.IsUser | Level.IsRegistered);
    expect(screen.queryByRole('menuitem', { name: 'UserMenu.reportQueue' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'UserMenu.myReports' }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.MY_REPORTS);
    expect(screen.getByRole('tab', { name: /My Reports/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('adds the Report Queue for moderators', () => {
    renderAs('3.1.0 ()', Level.IsUser | Level.IsRegistered | Level.IsModerator);
    fireEvent.click(screen.getByRole('menuitem', { name: 'UserMenu.reportQueue' }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.REPORT_QUEUE);
  });

  it('shows neither on a 3.0 server', () => {
    renderAs('3.0.0 ()', Level.IsUser | Level.IsRegistered | Level.IsModerator);
    expect(screen.queryByRole('menuitem', { name: 'UserMenu.myReports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'UserMenu.reportQueue' })).not.toBeInTheDocument();
  });
});
