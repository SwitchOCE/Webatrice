import { useEffect } from 'react';
import { useLocation, type To } from 'react-router-dom';

import { useKnownHosts } from '@app/feature-widgets/known-hosts';
import { LoadingState, usePreference } from '@app/hooks';
import { RouteEnum, StartupTab, type LoginRouteState, type Preferences, type ServerRouteState } from '@app/types';
import { getHostKey } from '@app/utils';

export interface StartupDestination {
  to: To;
  state?: ServerRouteState;
}

/**
 * Whether this page load has had its first login. A reload sends the user through the login page
 * (AuthGuard) with the page they were on; only the login that page load starts with returns
 * there. Mutable for tests, like `autoLoginGate`.
 */
export const pageLoadLoginGate = { done: false };

/**
 * Where a login lands, reconciling desktop's startup tab (window_main.cpp
 * `startupDestination`, tab_supervisor.cpp `initStartupTabs`) with a browser page:
 *
 * - The first login of a page load returns to the page the user was on (`from`), so a reload
 *   keeps the current route. A page load that started on the login page has no `from`.
 * - Any other login goes to the startup tab. Server Room opens its room only on a login to the
 *   startup server (any server when none is chosen), since room names belong to a server; a login
 *   elsewhere, or with no room name, opens the lobby. Desktop's startup server also picks what to
 *   connect to at launch; here the login form's Auto Connect does that, so it is not repeated.
 */
export function resolveStartupDestination(
  preferences: Pick<Preferences, 'startupTab' | 'startupServer' | 'startupRoom'>,
  loginServer: string | undefined,
  from: string | undefined,
): StartupDestination {
  if (from) {
    return { to: from };
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

/** The login page's destination once connected. See `resolveStartupDestination`. */
export function useStartupDestination(isConnected: boolean): StartupDestination {
  const location = useLocation();
  const preferences = {
    startupTab: usePreference('startupTab'),
    startupServer: usePreference('startupServer'),
    startupRoom: usePreference('startupRoom'),
  };
  const knownHosts = useKnownHosts();
  const selectedHost = knownHosts.status === LoadingState.READY ? knownHosts.value?.selectedHost : undefined;
  const from = pageLoadLoginGate.done ? undefined : (location.state as LoginRouteState | null)?.from;

  // Flipped after the commit that navigates away, so StrictMode's second render agrees with the first.
  useEffect(() => {
    if (isConnected) {
      pageLoadLoginGate.done = true;
    }
  }, [isConnected]);

  return resolveStartupDestination(preferences, selectedHost && getHostKey(selectedHost), from);
}
