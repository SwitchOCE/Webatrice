import { Navigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

type ServerCapability = Parameters<typeof server.Selectors.supports>[1];

interface CapabilityGuardProps {
  capability: ServerCapability;
}

// Sends the user away from a page the connected Servatrice cannot serve (a 3.1
// tool on a 3.0 server). See datatrice.instructions.md#server-capabilities.
const CapabilityGuard = ({ capability }: CapabilityGuardProps) => {
  const supported = useAppSelector((state) => server.Selectors.supports(state, capability));
  return !supported
    ? <Navigate to={RouteEnum.SERVER} />
    : <></>;
};

export default CapabilityGuard;
