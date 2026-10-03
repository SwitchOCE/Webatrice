import { useRef } from 'react';

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
  const pendingNamesRef = useRef<string[]>([]);

  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem }>(({ payload: { path, treeItem } }) => {
    const index = pendingNamesRef.current.indexOf(treeItem.name);
    if (path !== '' || index < 0 || !treeItem.id) {
      return;
    }
    pendingNamesRef.current.splice(index, 1);
    onImported(treeItem.id);
  }, server.Types.DECK_UPLOAD, [onImported]);

  return (xml: string, colorIdentity?: string) => {
    let name: string;
    try {
      name = parseCod(xml).name;
    } catch {
      return;
    }
    pendingNamesRef.current.push(name);
    webClient.request.session.deckUpload('', 0, xml, undefined, colorIdentity || undefined);
  };
}
