import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

interface ModGuardProps {
  children?: ReactNode;
}

// Renders its children only for a moderator, so a staff page's body (and the
// commands its effects send) never mounts for anyone else.
const ModGuard = ({ children }: ModGuardProps) => {
  const isModerator = useAppSelector(server.Selectors.getIsUserModerator);
  return !isModerator
    ? <Navigate to={RouteEnum.SERVER} />
    : <>{children}</>;
};

export default ModGuard;
