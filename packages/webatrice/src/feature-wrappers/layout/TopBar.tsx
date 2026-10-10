import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, generatePath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { rooms, games } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { useWebClient } from '@cockatrice/datatrice/react';
import { IconButton } from '@app/components';
import { useDocumentTitle, useLeaveGame, useOpenedReplays } from '@app/hooks';
import { closeReplay } from '@app/services';
import { RouteEnum, type DeckRouteState } from '@app/types';
import { NotificationBell } from '@app/feature-widgets/notifications';
import { useUnreadCounts } from '@app/hooks';

import TabList from './TabList';
import { useBackendDeckNames } from './hooks/useBackendDeckNames';
import { useConnectionState } from './hooks/useConnectionState';
import { useIdentityChange } from './hooks/useIdentityChange';
import { useNavRailHidden } from './hooks/useNavRailHidden';
import { usePersistLastRoute } from './hooks/usePersistLastRoute';
import { useStickyTabs } from './hooks/useStickyTabs';
import { usePrivateChatRegistration } from './hooks/usePrivateChatRegistration';
import {
  addStickyTab, detectTransientTab, isPlaceTab, isStickyTabType, routeMatches, stripGroups, tabTitle, tabUnread,
  withDeckNames, type Tab,
} from './topBarTabs';

export default function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const webClient = useWebClient();
  const leaveGameRequest = useLeaveGame();

  const connectionState = useConnectionState();
  const [railHidden, setRailHidden] = useNavRailHidden();
  const unreadCounts = useUnreadCounts();
  const joinedRooms = useAppSelector(rooms.Selectors.getJoinedRooms);
  const activeGames = useAppSelector(games.Selectors.getActiveGames);
  const openedReplays = useOpenedReplays();

  const [stickyTabs, setStickyTabs] = useStickyTabs();
  const unregisterPrivateChat = usePrivateChatRegistration(stickyTabs);
  useEffect(() => {
    const transient = detectTransientTab(location.pathname);
    if (!transient || !isStickyTabType(transient.type) || isPlaceTab(transient)) {
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
        spectating: game.spectator,
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

    list.push(...withDeckNames(stickyTabs, deckIdToName));

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
    unregisterPrivateChat(tab);
    if (isStickyTabType(tab.type)) {
      setStickyTabs((prev) => prev.filter((t) => t.key !== tab.key));
    }
    if (activeKey === tab.key) {
      navigate(generatePath(RouteEnum.SERVER));
    }
  };

  const groups = useMemo(() => stripGroups(tabs), [tabs]);

  return (
    <header className="relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface pl-1.5 pr-2">
      <IconButton
        size="sm"
        label={railHidden ? t('TopBar.rail.show') : t('TopBar.rail.hide')}
        onClick={() => setRailHidden(!railHidden)}
      >
        {railHidden ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
      </IconButton>
      <span role="status" className="sr-only">{t(`TopBar.connection.${connectionState}`)}</span>
      <TabList
        groups={groups}
        activeKey={activeKey}
        onClose={handleClose}
        unreadOf={(tab) => tabUnread(tab, unreadCounts)}
      />
      <NotificationBell />
    </header>
  );
}
