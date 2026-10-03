import { Navigate, useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum, type LoginRouteState } from '@app/types';

/**
 * Sends a signed-out user to the login page, carrying the page they were on (`from`) so the
 * login a reload starts with can return there (see the login page's startup destination).
 */
const AuthGuard = () => {
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const { pathname, search } = useLocation();
  return !isConnected
    ? <Navigate to={RouteEnum.LOGIN} state={{ from: pathname + search } satisfies LoginRouteState} />
    : <></>;
};

export default AuthGuard;
