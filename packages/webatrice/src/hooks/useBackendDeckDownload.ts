import { useCallback } from 'react';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { RequestId } from '@cockatrice/sockatrice/types';

/** Downloads one server deck; a tracked caller passes its request id, echoed on the answer. */
export function useBackendDeckDownload() {
  const client = useWebClient();
  return useCallback(
    (deckId: number, ...correlation: [requestId?: RequestId]) => client.request.session.deckDownload(deckId, ...correlation),
    [client],
  );
}
