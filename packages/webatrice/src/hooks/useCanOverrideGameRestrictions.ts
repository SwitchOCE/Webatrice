import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';

import { useAdminLocked } from './useAdminLock';

export function useCanOverrideGameRestrictions(): boolean {
  const isModerator = useAppSelector(server.Selectors.getIsUserModerator);
  const isJudge = useAppSelector(server.Selectors.getIsUserJudge);
  const locked = useAdminLocked();
  return (isModerator && !locked) || isJudge;
}
