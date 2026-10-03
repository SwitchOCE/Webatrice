import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { server, type ServerCapability } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

interface CapabilityGuardProps {
  capability: ServerCapability;
  children?: ReactNode;
}

// Sends the user away from a page the connected Servatrice cannot serve (a 3.1
// tool on a 3.0 server), and mounts its children only when the server can, so
// their effects never send a command it would reject.
// See datatrice.instructions.md#server-capabilities.
const CapabilityGuard = ({ capability, children }: CapabilityGuardProps) => {
  const supported = useAppSelector((state) => server.Selectors.supports(state, capability));
  return !supported
    ? <Navigate to={RouteEnum.SERVER} />
    : <>{children}</>;
};

export default CapabilityGuard;
