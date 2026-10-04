import { Navigate, useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum, type LoginRouteState } from '@app/types';

/**
 * Sends a signed-out user to the login page, carrying the page they were on (`from`) so the
 * login a reload starts with can return there (see the login page's startup destination).
 *
 * @critical The guard renders nothing once the login route is reached. A `Navigate` whose `state`
 * is a fresh object counts as a new location every time, so a guard still mounted on the login
 * route (a page that renders it without its own Routes) would navigate on every render forever.
 */
const AuthGuard = () => {
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const { pathname, search } = useLocation();
  if (isConnected || pathname === RouteEnum.LOGIN) {
    return <></>;
  }
  return <Navigate to={RouteEnum.LOGIN} state={{ from: pathname + search } satisfies LoginRouteState} />;
};

export default AuthGuard;
