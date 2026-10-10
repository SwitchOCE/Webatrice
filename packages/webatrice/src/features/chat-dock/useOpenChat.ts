import { useCallback } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { RouteEnum } from '@app/types';

export function useOpenChat(): (userName: string) => void {
  const navigate = useNavigate();
  return useCallback((userName: string) => navigate(generatePath(RouteEnum.PLAYER, { name: userName })), [navigate]);
}
