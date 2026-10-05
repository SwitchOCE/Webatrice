import { useEffect, useRef } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_DeckStorage_TreeItem } from '@cockatrice/sockatrice/generated';
import { useReduxEffect } from '@app/hooks';
import { parseCod } from '@app/services';

/**
 * "Import to my decks" for a deck someone else shared or published: upload a
 * copy into the root of the caller's deck storage, then hand its new id on.
 * Desktop opens such a deck in an unsaved editor tab instead; Webatrice's
 * editor only edits stored decks, so the copy is stored first, with the
 * color identity the share or listing already gave. An upload failure is
 * reported by the shell's `CommandFailureNotices`.
 */
export function useImportDeckCopy(onImported: (deckId: number) => void) {
  const webClient = useWebClient();
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    const pending = pendingRef.current;
    return () => pending.clear();
  }, []);

  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem; requestId?: string }>(({ payload }) => {
    const { treeItem, requestId } = payload;
    if (!requestId || !pendingRef.current.delete(requestId)) {
      return;
    }
    if (treeItem.id) {
      onImported(treeItem.id);
    }
  }, server.Types.DECK_UPLOAD, [onImported]);

  useReduxEffect<{ requestId?: string }>(({ payload: { requestId } }) => {
    if (requestId) {
      pendingRef.current.delete(requestId);
    }
  }, server.Types.DECK_UPLOAD_FAILED, []);

  return (xml: string, colorIdentity?: string) => {
    try {
      parseCod(xml);
    } catch {
      return;
    }
    const requestId = crypto.randomUUID();
    pendingRef.current.add(requestId);
    webClient.request.session.deckUpload('', 0, xml, undefined, colorIdentity || undefined, requestId);
  };
}
