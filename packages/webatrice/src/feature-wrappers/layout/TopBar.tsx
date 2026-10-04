import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, generatePath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User, LogOut, Home as HomeIcon, Swords, Library, LibraryBig,
  UserCircle2, Settings as SettingsIcon, FileText, X, Circle, Grid3x3,
  Keyboard, PanelLeftOpen, ShieldCheck, Flag,
  Film,
  type LucideIcon,
} from 'lucide-react';

import { server, rooms, games } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { useWebClient } from '@cockatrice/datatrice/react';
import {
  useDocumentTitle, useLeaveGame, useOpenedReplays, usePhaseTrackPinnedSetting, useSnapGridSetting,
} from '@app/hooks';
import { Images } from '@app/images';
import { closeReplay } from '@app/services';
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, type MenuAnchor } from '@app/components';
import { DebugLogDialog } from '@app/dialogs';
import { RouteEnum, type DeckRouteState } from '@app/types';
import { CardImportDialog } from '@app/feature-widgets/card-import';

import LatencyStatus from './LatencyStatus';
import { useShellLifecycle } from './ShellLifecycleContext';
import { useBackendDeckNames } from './hooks/useBackendDeckNames';
import { useIdentityChange } from './hooks/useIdentityChange';
import { usePersistLastRoute } from './hooks/usePersistLastRoute';
import { useStickyTabs } from './hooks/useStickyTabs';
import {
  addStickyTab, detectTransientTab, isStickyTabType, routeMatches, tabTitle, withDeckNames,
  type Tab, type TabType,
} from './topBarTabs';
import { UserMenuDialog, visibleUserMenuEntries, type CapabilityCheck } from './userMenuEntries';

const TYPE_ICON: Record<TabType, LucideIcon> = {
  server: HomeIcon,
  room: HomeIcon,
  game: Swords,
  decks: LibraryBig,
  deck: Library,
  'my-decks': LibraryBig,
  settings: SettingsIcon,
  shortcuts: Keyboard,
  account: UserCircle2,
  logs: FileText,
  player: User,
  staff: ShieldCheck,
  replays: Film,
  replay: Film,
  'my-reports': Flag,
  unknown: FileText,
};

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
  const { onIdentityChanged } = useShellLifecycle();
  const [openDialog, setOpenDialog] = useState<UserMenuDialog | null>(null);

  // Each visit to a sticky page (see `isStickyTabType`) pins its tab.
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

  // Server/user identity change: deck ids are per user on Servatrice, so
  // purge the deck tabs and report the change so features drop their
  // server-scoped caches (AppShell wires the deck caches). If the user is
  // on a now-stale deck route, bounce them to the lobby so the editor
  // doesn't try to load an id that doesn't exist here.
  useIdentityChange(() => {
    setStickyTabs((prev) => prev.filter((t) => t.type !== 'deck' && t.type !== 'decks'));
    onIdentityChanged();
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

    // Replay tabs live until "Close replay", like desktop's replay TabGames.
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
  // The browser tab follows the active app tab, as a desktop window title does,
  // in the current language: keyed titles are translated here, like the tab list.
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
            {/* Mounted for the whole session so each change of state is announced. The seconds
             *  count stays out of the spoken text, which would otherwise change every second. */}
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

interface TabListProps {
  tabs: Tab[];
  activeKey: string;
  onClose: (tab: Tab) => void;
}

/**
 * The open rooms, games, replays and pages. Each tab is a route, so this is
 * page navigation (links with aria-current), not an ARIA tablist: there are no
 * tab panels and every tab is reachable with Tab. The current tab comes from
 * `activeKey` rather than NavLink's own matching, which can't express the
 * fall-back to the Lobby. Close is a sibling button, never nested in the link.
 */
function TabList({ tabs, activeKey, onClose }: TabListProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('TopBar.tabs.label')} className="h-full">
      <ul className="flex items-end h-full gap-0.5 overflow-x-auto overflow-y-hidden min-w-0">
        {tabs.map((tab) => {
          const Icon = TYPE_ICON[tab.type];
          const active = tab.key === activeKey;
          return (
            <li
              key={tab.key}
              // Middle-click closes, like desktop's tab bar (and instead of
              // opening the link in a new browser tab).
              onAuxClick={(e) => {
                if (e.button === 1 && tab.closeable) {
                  e.preventDefault();
                  onClose(tab);
                }
              }}
              className={[
                'group relative flex items-center gap-2 h-9 pr-2 rounded-t-md',
                'select-none min-w-[140px] max-w-[220px] shrink-0 transition-colors',
                active
                  ? 'bg-bg-base text-text-primary border border-b-0 border-border-subtle'
                  : 'bg-bg-elevated/40 text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              ].join(' ')}
            >
              <Link
                to={tab.route}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex-1 min-w-0 self-stretch flex items-center gap-2 pl-3 rounded-t-md',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                ].join(' ')}
              >
                <Icon size={14} aria-hidden className={active ? 'text-accent' : 'text-text-muted'} />
                <span className="flex-1 text-sm truncate">{tabTitle(tab, t)}</span>
              </Link>
              {tab.closeable ? (
                <button
                  type="button"
                  onClick={() => onClose(tab)}
                  // Never dimmed: the icon needs its full 3:1 against the tab.
                  className="p-0.5 rounded hover:bg-border-subtle text-text-muted hover:text-text-primary"
                  title={t('TopBar.tabs.close', { title: tabTitle(tab, t) })}
                  aria-label={t('TopBar.tabs.close', { title: tabTitle(tab, t) })}
                >
                  <X size={12} aria-hidden />
                </button>
              ) : (
                <span className="w-4" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface UserMenuProps {
  userName: string | null;
  userLevel: number;
  snapGridVisible: boolean;
  onToggleSnapGrid: () => void;
  phaseTrackPinned: boolean;
  onTogglePhaseTrackPinned: () => void;
  onNavigate: (route: RouteEnum) => void;
  onOpenDialog: (dialog: UserMenuDialog) => void;
  onSignOut: () => void;
}

function UserMenu({
  userName,
  userLevel,
  snapGridVisible,
  onToggleSnapGrid,
  phaseTrackPinned,
  onTogglePhaseTrackPinned,
  onNavigate,
  onOpenDialog,
  onSignOut,
}: UserMenuProps) {
  const { t } = useTranslation();
  const serverVersion = useAppSelector(server.Selectors.getVersion);
  const supports: CapabilityCheck = (capability) => server.serverSupports(serverVersion, capability);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setAnchor(null), []);

  const toggle = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor((open) => (open || !rect ? null : { x: rect.right, y: rect.bottom + 4, align: 'end' }));
  };

  const displayName = userName ?? t('TopBar.user.signedIn');

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !anchor) {
            e.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={anchor != null}
        className="flex items-center gap-2 px-2 py-1 rounded-md bg-bg-elevated hover:bg-border-subtle transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center">
          <User size={14} className="text-white" />
        </div>
        <span className="text-sm font-medium text-text-primary max-w-[10rem] truncate">
          {displayName}
        </span>
      </button>

      {anchor && (
        <Menu anchor={anchor} label={displayName} onClose={close} triggerRef={triggerRef} className="w-56">
          <div className="px-3 py-2 mb-1 border-b border-border-subtle" aria-hidden>
            <span className="text-sm font-medium text-text-primary truncate">{displayName}</span>
          </div>
          <MenuCheckboxItem
            checked={snapGridVisible}
            onChange={onToggleSnapGrid}
            icon={<Grid3x3 size={14} />}
          >
            {t('TopBar.game.snapGrid')}
          </MenuCheckboxItem>
          {/* The stored preference is `phaseTrackPinned`; this entry exposes
           *  the inverse ("auto-hide on/off") so the checked state and the
           *  checkmark flip together. When auto-hide is ON (checked), the
           *  phase track collapses to an 8-px HUD. */}
          <MenuCheckboxItem
            checked={!phaseTrackPinned}
            onChange={onTogglePhaseTrackPinned}
            icon={<PanelLeftOpen size={14} />}
            title={phaseTrackPinned ? t('TopBar.game.phaseTrackCollapse') : t('TopBar.game.phaseTrackPin')}
          >
            {t('TopBar.game.phaseTrackToggle')}
          </MenuCheckboxItem>
          {visibleUserMenuEntries(userLevel, supports).map((entry) => (
            <MenuItem
              key={entry.route ?? entry.dialog}
              icon={<entry.icon size={14} />}
              onSelect={() => {
                close();
                if (entry.route) {
                  onNavigate(entry.route);
                } else {
                  onOpenDialog(entry.dialog);
                }
              }}
            >
              {t(entry.label)}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={14} />}
            onSelect={() => {
              close();
              onSignOut();
            }}
          >
            {t('TopBar.user.signOut')}
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}
