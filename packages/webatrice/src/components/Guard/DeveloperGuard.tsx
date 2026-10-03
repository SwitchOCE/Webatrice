import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

interface DeveloperGuardProps {
  children?: ReactNode;
}

// Developer staff role (Cockatrice 3.1): desktop offers the Developer tab only to
// users with the IsDeveloper flag. The children mount only for a developer.
const DeveloperGuard = ({ children }: DeveloperGuardProps) => {
  const isDeveloper = useAppSelector(server.Selectors.getIsUserDeveloper);
  return !isDeveloper
    ? <Navigate to={RouteEnum.SERVER} />
    : <>{children}</>;
};

export default DeveloperGuard;
