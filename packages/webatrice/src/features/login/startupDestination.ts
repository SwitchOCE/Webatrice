import { useEffect, useState } from 'react';
import { useLocation, type To } from 'react-router-dom';

import { useKnownHosts } from '@app/feature-widgets/known-hosts';
import { LoadingState, usePreference } from '@app/hooks';
import { RouteEnum, StartupTab, type LoginRouteState, type Preferences, type ServerRouteState } from '@app/types';
import { getHostKey } from '@app/utils';

export interface StartupDestination {
  to: To;
  state?: ServerRouteState;
}

const PAGE_SESSION_KEY = 'webatrice.pageSession';

function navigationType(): string | undefined {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return undefined;
  }
  const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return navigation?.type;
}

/**
 * Whether this page load reloads a page already open in this tab, read once at boot.
 * Navigation Timing decides when available: a same-tab launch also retains sessionStorage.
 * The tab marker is a fallback for browsers that omit the navigation entry.
 */
export function detectPageReload(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, type: string | undefined): boolean {
  let seenThisTab = false;
  try {
    seenThisTab = (storage?.getItem(PAGE_SESSION_KEY) ?? null) !== null;
    storage?.setItem(PAGE_SESSION_KEY, '1');
  } catch {
    /* storage blocked: use the navigation type when available */
  }
  return type === undefined ? seenThisTab : type === 'reload';
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * The page load's login state: whether it has had its first login (`done`), and whether it is a
 * reload (`reload`), which keeps the page the user was on instead of opening the startup tab.
 * Mutable for tests, like `autoLoginGate`.
 */
export const pageLoadLoginGate = { done: false, reload: detectPageReload(sessionStorageOrUndefined(), navigationType()) };

/**
 * Where a login lands, following desktop's startup tab (window_main.cpp `startupDestination`,
 * tab_supervisor.cpp `initStartupTabs`), which applies once per launch:
 *
 * - The first login of a page load that is not a reload (`detectPageReload`) opens the startup tab,
 *   whatever page the last session was on. Server Room opens its room only on a login to the
 *   startup server (any server when none is chosen), since room names belong to a server; a login
 *   elsewhere, or with no room name, opens the lobby. Desktop's startup server also picks what to
 *   connect to at launch; here the login form's Auto Connect does that, so it is not repeated.
 * - Every other login (a reload's, a reconnect, signing in again) returns to the page the user was
 *   sent away from (`from`), or the lobby.
 */
export function resolveStartupDestination(
  preferences: Pick<Preferences, 'startupTab' | 'startupServer' | 'startupRoom'>,
  loginServer: string | undefined,
  from: string | undefined,
  applyStartupTab: boolean,
): StartupDestination {
  if (!applyStartupTab) {
    return { to: from ?? RouteEnum.SERVER };
  }
  switch (preferences.startupTab) {
    case StartupTab.DeckStorage:
      return { to: RouteEnum.DECKS };
    case StartupTab.Replays:
      return { to: RouteEnum.REPLAYS };
    case StartupTab.ServerRoom: {
      const onStartupServer = !preferences.startupServer || preferences.startupServer === loginServer;
      return onStartupServer && preferences.startupRoom
        ? { to: RouteEnum.SERVER, state: { startupRoom: preferences.startupRoom } }
        : { to: RouteEnum.SERVER };
    }
    default:
      return { to: RouteEnum.SERVER };
  }
}

/**
 * The login page's destination once connected. See `resolveStartupDestination`.
 *
 * @critical Whether this login opens the startup tab, and the page it would otherwise return to,
 * are captured when the login page mounts, and the gate latches in an effect. The login page stays
 * mounted while the first post-login events arrive (user info, rooms), and each re-renders it; a
 * destination read from the latched gate would hand `Navigate` a second `to`, and that second
 * navigation would override the first. Latching in render would also let a render React discards
 * (StrictMode, concurrent rendering) spend the page load's first login.
 */
export function useStartupDestination(isConnected: boolean): StartupDestination {
  const location = useLocation();
  const preferences = {
    startupTab: usePreference('startupTab'),
    startupServer: usePreference('startupServer'),
    startupRoom: usePreference('startupRoom'),
  };
  const knownHosts = useKnownHosts();
  const selectedHost = knownHosts.status === LoadingState.READY ? knownHosts.value?.selectedHost : undefined;
  const [eligibility] = useState(() => ({
    applyStartupTab: !pageLoadLoginGate.done && !pageLoadLoginGate.reload,
    from: (location.state as LoginRouteState | null)?.from,
  }));

  useEffect(() => {
    if (isConnected) {
      pageLoadLoginGate.done = true;
    }
  }, [isConnected]);

  return isConnected
    ? resolveStartupDestination(
      preferences,
      selectedHost && getHostKey(selectedHost),
      eligibility.from,
      eligibility.applyStartupTab,
    )
    : { to: RouteEnum.SERVER };
}
