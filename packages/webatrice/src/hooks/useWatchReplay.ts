import { useCallback } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { useWebClient } from '@cockatrice/datatrice/react';
import { openReplay, parseReplay } from '@app/services';
import { RouteEnum } from '@app/types';

/**
 * Decodes replay bytes and opens them in a replay tab (desktop's `openReplay`
 * signal → a replay TabGame). Throws `ReplayParseError` for bytes that are not
 * a Cockatrice replay, leaving the caller to report it.
 */
export function useWatchReplay(): (data: Uint8Array, title: string) => void {
  const navigate = useNavigate();
  const webClient = useWebClient();
  return useCallback((data: Uint8Array, title: string) => {
    const replayKey = openReplay(parseReplay(data), title, webClient);
    navigate(generatePath(RouteEnum.REPLAY, { replayKey }));
  }, [navigate, webClient]);
}
