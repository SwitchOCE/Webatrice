import { useCallback } from 'react';
import { useWebClient } from '@cockatrice/datatrice/react';

export function useBackendDeckDownload() {
  const client = useWebClient();
  return useCallback((deckId: number) => client.request.session.deckDownload(deckId), [client]);
}
