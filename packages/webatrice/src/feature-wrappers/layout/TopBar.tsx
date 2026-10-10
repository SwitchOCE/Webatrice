import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, generatePath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Circle, Film } from 'lucide-react';

import { server, rooms, games } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { useWebClient } from '@cockatrice/datatrice/react';
import {
  useDocumentTitle, useLeaveGame, useOpenedReplays, usePhaseTrackPinnedSetting, useSnapGridSetting,
} from '@app/hooks';
import { Images } from '@app/images';
import { closeReplay } from '@app/services';
import { DebugLogDialog } from '@app/dialogs';
import { RouteEnum, type DeckRouteState } from '@app/types';
import { CardImportDialog } from '@app/feature-widgets/card-import';

import LatencyStatus from './LatencyStatus';
import TabList from './TabList';
import UserMenu from './UserMenu';
import { useBackendDeckNames } from './hooks/useBackendDeckNames';
import { useIdentityChange } from './hooks/useIdentityChange';
import { usePersistLastRoute } from './hooks/usePersistLastRoute';
import { useStickyTabs } from './hooks/useStickyTabs';
import {
  addStickyTab, detectTransientTab, isStickyTabType, routeMatches, tabTitle, withDeckNames,
  type Tab,
} from './topBarTabs';
import { UserMenuDialog } from './userMenuEntries';

/**
 * Fancy-themed top bar. Purely a view over react-router: tabs are
 * derived from the current route + Redux state (joined rooms, active
 * games) so navigating anywhere still works via `navigate()`. Clicking
 * a tab navigates; closing a room/game tab sends the corresponding
 * leave command through the WebSocket. The pinned "Lobby" tab is
 * always present and non-closeable, matching fancy's shape.
 */
export default function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const webClient = useWebClient();
  const leaveGameRequest = useLeaveGame();

  const user = useAppSelector(server.Selectors.getUser);
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const isServerUnresponsive = useAppSelector(server.Selectors.getIsServerUnresponsive);
  const connectionState = !isConnected ? 'disconnected' : isServerUnresponsive ? 'stale' : 'connected';
  const joinedRooms = useAppSelector(rooms.Selectors.getJoinedRooms);
  const activeGames = useAppSelector(games.Selectors.getActiveGames);
  const openedReplays = useOpenedReplays();
  const [snapGridVisible, setSnapGridVisible] = useSnapGridSetting();
  const [phaseTrackPinned, setPhaseTrackPinned] = usePhaseTrackPinnedSetting();
  const [openDialog, setOpenDialog] = useState<UserMenuDialog | null>(null);

  const [stickyTabs, setStickyTabs] = useStickyTabs();
  useEffect(() => {
    const transient = detectTransientTab(location.pathname);
    if (!transient || !isStickyTabType(transient.type)) {
      return;
    }
    const replacesDeckId = transient.type === 'deck'
      ? (location.state as DeckRouteState | null)?.replacesDeckId
      : undefined;
    setStickyTabs((prev) => addStickyTab(prev, transient, replacesDeckId));
  }, [location.pathname, location.state, setStickyTabs]);

  usePersistLastRoute();
  const deckIdToName = useBackendDeckNames();

  useIdentityChange(() => {
    setStickyTabs((prev) => prev.filter((t) => t.type !== 'deck' && t.type !== 'decks'));
    if (
      location.pathname.startsWith('/deck/')
      || location.pathname === RouteEnum.DECKS
    ) {
      navigate(generatePath(RouteEnum.SERVER));
    }
  });

  // Whenever the deck name enrichment ("Deck #N" → real name) resolves,
  // persist the freshly enriched title back into the sticky-tab list.
  // Without this, the next refresh would repaint from the stale
  // persisted title until deckList responds — a visible flash we can
  // just avoid by saving the good title while we have it.
  useEffect(() => {
    if (deckIdToName.size === 0) {
      return;
    }
    setStickyTabs((prev) => withDeckNames(prev, deckIdToName));
  }, [deckIdToName, setStickyTabs]);

  const tabs: Tab[] = useMemo(() => {
    const list: Tab[] = [
      {
        key: 'server',
        type: 'server',
        title: t('TopBar.tab.lobby'),
        route: generatePath(RouteEnum.SERVER),
        closeable: false,
      },
    ];

    for (const room of joinedRooms) {
      const roomId = room.info.roomId;
      list.push({
        key: `room:${roomId}`,
        type: 'room',
        title: room.info.name || t('TopBar.tab.room', { id: String(roomId) }),
        route: generatePath(RouteEnum.ROOM, { roomId: roomId.toString() }),
        closeable: true,
        onClose: () => {
          webClient.request.rooms.leaveRoom(roomId);
        },
      });
    }

    for (const game of activeGames) {
      const gameId = game.info.gameId;
      const title = game.info.description || t('TopBar.tab.game', { id: String(gameId) });
      list.push({
        key: `game:${gameId}`,
        type: 'game',
        title,
        route: generatePath(RouteEnum.GAME, { gameId: gameId.toString() }),
        closeable: true,
        onClose: () => leaveGameRequest(gameId),
      });
    }

    for (const replay of openedReplays) {
      list.push({
        key: `replay:${replay.key}`,
        type: 'replay',
        title: replay.title,
        route: generatePath(RouteEnum.REPLAY, { replayKey: replay.key }),
        closeable: true,
        onClose: () => closeReplay(replay.key),
      });
    }

    // Sticky tabs (Decks list + open deck editor). Enrich the deck
    // editor's title with its actual name if backendDecks has loaded.
    list.push(...withDeckNames(stickyTabs, deckIdToName));

    // Transient tab for other non-primary routes (Settings, Account,
    // Logs, Player). Appears only while active — non-sticky.
    const transient = detectTransientTab(location.pathname);
    if (
      transient &&
      transient.type !== 'decks' &&
      transient.type !== 'deck' &&
      !list.some((t) => t.key === transient.key)
    ) {
      list.push(transient);
    }

    return list;
  }, [joinedRooms, activeGames, openedReplays, location.pathname, webClient, leaveGameRequest, stickyTabs, deckIdToName, t]);

  const activeKey = useMemo(() => {
    const match = tabs.find((t) => routeMatches(location.pathname, t.route));
    return match?.key ?? 'server';
  }, [tabs, location.pathname]);
  const activeTab = tabs.find((tab) => tab.key === activeKey);
  useDocumentTitle(activeTab ? tabTitle(activeTab, t) : null);

  const handleClose = (tab: Tab) => {
    tab.onClose?.();
    // Sticky (decks / deck editor / shortcuts / player) tabs need to be
    // removed from the sticky list too — otherwise the effect above
    // would leave them pinned even after the user navigates away.
    if (isStickyTabType(tab.type)) {
      setStickyTabs((prev) => prev.filter((t) => t.key !== tab.key));
    }
    if (activeKey === tab.key) {
      navigate(generatePath(RouteEnum.SERVER));
    }
  };

  return (
    <header className="relative z-40 h-14 shrink-0 bg-bg-surface/80 backdrop-blur-md border-b border-border-subtle">
      <div className="flex h-full items-center">
        {/* Logo — raw cockatrice green PNG; the brand color reads fine
             next to the purple TopBar chrome. */}
        <div className="flex items-center gap-2 shrink-0 pl-4 pr-3">
          <div className="relative">
            <img src={Images.Logo} alt="Webatrice" className="h-8 w-8 rounded-md shadow-glow" />
            <Circle
              size={12}
              strokeWidth={3}
              aria-hidden
              className={[
                'absolute -bottom-0.5 -right-0.5 stroke-bg-surface',
                connectionState === 'disconnected'
                  ? 'text-danger fill-danger'
                  : connectionState === 'stale'
                    ? 'text-warning fill-warning'
                    : 'text-success fill-success',
              ].join(' ')}
            />
            <span role="status" className="sr-only">{t(`TopBar.connection.${connectionState}`)}</span>
          </div>
          <span className="font-modern text-lg font-bold tracking-wide text-text-primary">
            Webatrice
          </span>
        </div>

        <div className="w-px h-6 bg-border-subtle shrink-0" />

        {/* Tabs */}
        <div className="flex-1 min-w-0 h-full px-3">
          <TabList tabs={tabs} activeKey={activeKey} onClose={handleClose} />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0 pl-3 pr-4">
          <LatencyStatus />
          <button
            onClick={() => navigate(generatePath(RouteEnum.DECKS))}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium',
              'text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors',
            ].join(' ')}
            title={t('TopBar.decks.title')}
          >
            <Library size={16} /> {t('TopBar.decks.button')}
          </button>
          <button
            onClick={() => navigate(generatePath(RouteEnum.REPLAYS))}
            className={[
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium',
              'text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors',
            ].join(' ')}
            title={t('TopBar.replays.title')}
          >
            <Film size={16} /> {t('TopBar.replays.button')}
          </button>
          <div className="w-px h-6 bg-border-subtle mx-1" />
          <UserMenu
            userName={user?.name ?? null}
            userLevel={user?.userLevel ?? 0}
            snapGridVisible={snapGridVisible}
            onToggleSnapGrid={() => setSnapGridVisible(!snapGridVisible)}
            phaseTrackPinned={phaseTrackPinned}
            onTogglePhaseTrackPinned={() => setPhaseTrackPinned(!phaseTrackPinned)}
            onNavigate={(route) => navigate(generatePath(route))}
            onOpenDialog={setOpenDialog}
            onSignOut={() => webClient.request.authentication.disconnect()}
          />
        </div>
      </div>
      <CardImportDialog
        isOpen={openDialog === UserMenuDialog.CardImport}
        handleClose={() => setOpenDialog(null)}
      />
      <DebugLogDialog isOpen={openDialog === UserMenuDialog.DebugLog} onClose={() => setOpenDialog(null)} />
    </header>
  );
}
