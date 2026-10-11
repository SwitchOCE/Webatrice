import { useMemo } from 'react';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';

import { staffHomeRoute, staffToolStates, type StaffToolState } from './staffTools';
import type { RouteEnum } from '@app/types';

export interface StaffTools {
  states: StaffToolState[];
  home: RouteEnum | null;
}

export function useStaffTools(): StaffTools {
  const userLevel = useAppSelector((state) => server.Selectors.getUser(state)?.userLevel ?? 0);
  const version = useAppSelector(server.Selectors.getVersion);
  return useMemo(() => {
    const states = staffToolStates(userLevel, (capability) => server.serverSupports(version, capability));
    return { states, home: staffHomeRoute(states) };
  }, [userLevel, version]);
}
