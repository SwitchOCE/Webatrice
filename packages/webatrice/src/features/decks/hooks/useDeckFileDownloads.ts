import { useCallback, useRef } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';

import { saveTextFile } from '../browserHandoff';
import { exportFileName } from '../deckExport';
import type { FlatDeck } from '../deckTree';

/**
 * The `.cod` file name for a downloaded deck. Desktop writes `deck_<id>.cod`
 * into a local folder tree; a browser saves flat files, so the deck's folder
 * below the downloaded one prefixes its name instead.
 */
export function deckFileName(deck: FlatDeck, fromFolder: string): string {
  let relative = deck.path;
  if (deck.path === fromFolder) {
    relative = '';
  } else if (fromFolder && deck.path.startsWith(`${fromFolder}/`)) {
    relative = deck.path.slice(fromFolder.length + 1);
  }
  const folders = relative.split('/').filter(Boolean);
  return exportFileName([...folders, deck.name].join(' '), 'cod');
}

/**
 * Desktop `TabDeckStorage::actDownload` for a browser: download remote
 * decks and save each as a `.cod` file. A folder downloads every deck in
 * it, at any depth.
 */
export function useDeckFileDownloads(): { download: (decks: readonly FlatDeck[], fromFolder?: string) => void } {
  const webClient = useWebClient();
  // Deck id → file name, while the deck's XML is on its way.
  const pendingRef = useRef<Map<number, string>>(new Map());

  useReduxEffect<{ deckId: number; deck: string }>(
    ({ payload }) => {
      const fileName = pendingRef.current.get(payload.deckId);
      if (fileName === undefined) {
        return;
      }
      pendingRef.current.delete(payload.deckId);
      saveTextFile(fileName, payload.deck, 'application/xml');
    },
    server.Types.DECK_DOWNLOADED,
    [],
  );

  const download = useCallback((decks: readonly FlatDeck[], fromFolder = '') => {
    for (const deck of decks) {
      pendingRef.current.set(deck.id, deckFileName(deck, fromFolder));
      webClient.request.session.deckDownload(deck.id);
    }
  }, [webClient]);

  return { download };
}
