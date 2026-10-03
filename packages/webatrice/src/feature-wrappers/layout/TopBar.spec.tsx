import { act, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { i18n as I18n } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';
import { closeReplay, getOpenedReplay, getOpenedReplays, openReplay } from '@app/services';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';

import { getSettings, settingsStore } from '../../hooks/useSettings';
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
  it('focuses a surviving tab after closing the focused tab', () => {
    renderTopBar(RouteEnum.SETTINGS);
    // Tabs opened by earlier tests stay open (sticky tabs), so close the active Settings tab by its own button.
    const settings = screen.getAllByRole('link').find((link) => link.getAttribute('aria-current') === 'page')!;
    const close = within(settings.parentElement!).getByRole('button', { name: 'TopBar.tabs.close' });
    close.focus();
    fireEvent.click(close);
    // Focus moves to a surviving tab (the next one, else the previous), not to the document body.
    const focused = document.activeElement;
    expect(focused?.tagName).toBe('A');
    expect(screen.getAllByRole('link')).toContain(focused);
    expect(focused).not.toHaveAttribute('href', RouteEnum.SETTINGS);
  });
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
    expect(screen.getByRole('link', { name: /UserMenu\.account/ })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toMatch(/UserMenu\.account · Webatrice$/);

    openMenuAndPick('UserMenu.settings');
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SETTINGS);
    expect(screen.queryByRole('link', { name: /UserMenu\.account/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /TopBar\.tab\.lobby/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
    expect(screen.queryByRole('link', { name: /UserMenu\.settings/ })).not.toBeInTheDocument();
  });

  it('gives an unsaved deck draft the deck editor tab', () => {
    renderTopBar('/deck/draft/abc');

    expect(screen.getByRole('link', { name: /TopBar\.tab\.unsavedDeck/ })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('link', { name: /TopBar\.tab\.lobby/ }));
    fireEvent.click(screen.getByRole('link', { name: /TopBar\.tab\.unsavedDeck/ }));
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
    expect(screen.getByRole('link', { name: 'TopBar.replays.tab' })).toHaveAttribute('aria-current', 'page');
  });

  afterEach(() => {
    getOpenedReplays().forEach(({ key }) => closeReplay(key));
  });

  it('shows an open replay as a tab titled after it', () => {
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(`/replay/${replayKey}`);

    expect(screen.getByRole('link', { name: /final\.cor/ })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the replay tab after switching to another tab, and returns to it', () => {
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(`/replay/${replayKey}`);

    fireEvent.click(screen.getByRole('link', { name: /TopBar\.tab\.lobby/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.SERVER);
    const replayTab = screen.getByRole('link', { name: /final\.cor/ });
    expect(replayTab).not.toHaveAttribute('aria-current');

    fireEvent.click(replayTab);
    expect(screen.getByTestId('location')).toHaveTextContent(`/replay/${replayKey}`);
  });

  it('closing a replay tab closes the replay and unloads its game', () => {
    const webClient = createMockWebClient();
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', webClient);
    const { gameId } = getOpenedReplay(replayKey)!;
    renderTopBar(RouteEnum.SERVER);

    const replayTab = screen.getByRole('link', { name: /final\.cor/ }).closest('li')!;
    fireEvent.click(within(replayTab).getByRole('button', { name: 'TopBar.tabs.close' }));

    expect(screen.queryByRole('link', { name: /final\.cor/ })).not.toBeInTheDocument();
    expect(getOpenedReplay(replayKey)).toBeUndefined();
    expect(webClient.unloadReplayGame).toHaveBeenCalledWith(gameId);
  });

  it('closes a tab on middle-click', () => {
    const replayKey = openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(RouteEnum.SERVER);

    fireEvent(screen.getByRole('link', { name: /final\.cor/ }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));

    expect(screen.queryByRole('link', { name: /final\.cor/ })).not.toBeInTheDocument();
    expect(getOpenedReplay(replayKey)).toBeUndefined();
  });

  it('lists tabs as links in a labelled nav, with Close beside the link rather than inside it', () => {
    openReplay(buildReplay([sayContainer(0)]), 'final.cor', createMockWebClient());
    renderTopBar(RouteEnum.SERVER);

    const nav = screen.getByRole('navigation', { name: 'TopBar.tabs.label' });
    const replayLink = screen.getByRole('link', { name: /final\.cor/ });
    expect(nav).toContainElement(replayLink);
    const close = within(replayLink.closest('li')!).getByRole('button', { name: 'TopBar.tabs.close' });
    expect(replayLink).not.toContainElement(close);
    // The pinned Lobby tab has no close button.
    const lobbyTab = screen.getByRole('link', { name: /TopBar\.tab\.lobby/ }).closest('li')!;
    expect(within(lobbyTab).queryByRole('button')).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /UserMenu\.myReports/ })).toHaveAttribute('aria-current', 'page');
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

describe('TopBar tab titles', () => {
  let i18n: I18n;
  function I18nProbe() {
    i18n = useTranslation().i18n;
    return null;
  }

  afterEach(async () => {
    await act(() => i18n.changeLanguage('en-US'));
    i18n.removeResourceBundle('en-US', 'translation');
    i18n.addResourceBundle('en-US', 'translation', {});
    i18n.removeResourceBundle('de', 'translation');
    window.localStorage.clear();
  });

  it('retitles sticky tabs when the language changes', async () => {
    window.localStorage.setItem(OWNER_KEY, IDENTITY);
    renderWithProviders(
      <>
        <I18nProbe />
        <TopBar />
      </>,
      { preloadedState: connectedState, route: RouteEnum.DECKS },
    );
    i18n.addResourceBundle('en-US', 'translation', { TopBar: { tab: { myDecks: 'My Decks' } } });
    i18n.addResourceBundle('de', 'translation', { TopBar: { tab: { myDecks: 'Meine Decks' } } });
    await act(() => i18n.changeLanguage('en-US'));
    expect(screen.getByRole('link', { name: 'My Decks' })).toBeInTheDocument();

    await act(() => i18n.changeLanguage('de'));

    expect(screen.getByRole('link', { name: 'Meine Decks' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Decks' })).not.toBeInTheDocument();
  });

  it('names the browser tab after the active tab in the current language', async () => {
    renderWithProviders(
      <>
        <I18nProbe />
        <TopBar />
      </>,
      { preloadedState: connectedState, route: RouteEnum.SETTINGS },
    );
    i18n.addResourceBundle('en-US', 'translation', { UserMenu: { settings: 'Settings' } });
    i18n.addResourceBundle('de', 'translation', { UserMenu: { settings: 'Einstellungen' } });
    await act(() => i18n.changeLanguage('en-US'));
    expect(document.title).toBe('Settings · Webatrice');

    await act(() => i18n.changeLanguage('de'));

    expect(document.title).toBe('Einstellungen · Webatrice');
  });
});

describe('TopBar deck tabs', () => {
  // Deck tabs in tab order, by the route each one links to.
  const deckTab = () => screen
    .queryAllByRole('link', { name: 'TopBar.tab.deck' })
    .map((tab) => tab.getAttribute('href'));

  beforeEach(async () => {
    window.localStorage.clear();
    settingsStore.reset();
    await getSettings();
  });

  afterEach(() => {
    window.localStorage.clear();
    settingsStore.reset();
  });

  it('keeps one deck tab by default, as desktop does with the option off', () => {
    renderTopBar('/deck/1').unmount();
    renderTopBar('/deck/2');

    expect(deckTab()).toEqual(['/deck/2']);
  });

  it('opens a tab per deck once "Open deck in new tab by default" is on', async () => {
    const settings = await getSettings();
    settings.openDeckInNewTab = true;
    settingsStore.setValue(settings);

    renderTopBar('/deck/1').unmount();
    renderTopBar('/deck/2');

    expect(deckTab().sort()).toEqual(['/deck/1', '/deck/2']);
  });
});
