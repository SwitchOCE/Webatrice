import { create } from '@bufbuild/protobuf';

import type { WebClient } from '@cockatrice/sockatrice';
import {
  Command_DeckUpload_ext,
  Command_DeckUploadSchema,
  Response_DeckUpload_ext,
} from '@cockatrice/sockatrice/generated';
import { serializeCod, touchMeta } from '@app/services';

import type { HydratedDeck } from './types';

/**
 * Saving an open deck back to Servatrice deck storage.
 */

/** The `.cod` XML an autosave uploads, with `updatedAt` bumped to now. */
export function serializeDeckForSave(deck: HydratedDeck): string {
  return serializeCod({
    name: deck.name,
    meta: touchMeta(deck.meta),
    cards: deck.cards,
    format: deck.format,
    bannerCard: deck.bannerCard,
    lastLoadedTimestamp: deck.lastLoadedTimestamp,
    tagsXml: deck.tagsXml,
    bracketAssessment: deck.bracketAssessment,
  });
}

/**
 * Send a Command_DeckUpload that Servatrice treats as an **update** (not
 * a create), then refetch the deck list on success so the local tree
 * stays consistent.
 *
 * Why bypass `webClient.request.session.deckUpload`: Sockatrice's wrapper
 * always passes `path` in the constructor object, so the proto2
 * `optional string path` field is marked present on the wire even when
 * empty. Servatrice's handler branches on path presence first ("path was
 * sent → create at this folder") and ignores `deck_id`, so every
 * autosave would spawn a new deck at the root. Building the message with
 * just `{ deckId, deckList }` omits `path`, and the server takes the
 * deck_id update path.
 *
 * The wrapper's `uploadServerDeck` dispatch can't be reused either — that
 * reducer inserts the returned tree item without deduping by id, so an
 * update would duplicate the deck in the local tree. Instead `deckList()`
 * is refetched on success: its response replaces `backendDecks`
 * wholesale, so MyDecks and the tab titles see server truth.
 *
 * This raw call is a known layering exception, not a pattern: the fix is
 * a Sockatrice `request.session.deckUpdate` that leaves `path` unset
 * (parity follow-up #18), after which this module goes through it.
 */
export function uploadDeckUpdate(
  webClient: WebClient,
  deckId: number,
  deckList: string,
  onDone?: () => void,
  onFailed?: () => void,
): void {
  webClient.protobuf.sendSessionCommand(
    Command_DeckUpload_ext,
    create(Command_DeckUploadSchema, { deckId, deckList }),
    {
      responseExt: Response_DeckUpload_ext,
      onSuccess: () => {
        // "Saved" flips per save so the UI stays responsive; the tree
        // refetch is debounced so a burst of edits sends one deckList().
        onDone?.();
        scheduleDeckListRefetch(webClient);
      },
      // Server rejection, timeout or lost connection: the deck was not saved.
      onError: () => onFailed?.(),
    },
  );
}

// Matches the autosave debounce: long enough to coalesce a typing
// burst, short enough that MyDecks and the tab title feel live.
const DECK_LIST_REFETCH_DEBOUNCE_MS = 500;
let deckListRefetchTimer: number | null = null;

function scheduleDeckListRefetch(webClient: WebClient): void {
  if (deckListRefetchTimer != null) {
    window.clearTimeout(deckListRefetchTimer);
  }
  deckListRefetchTimer = window.setTimeout(() => {
    deckListRefetchTimer = null;
    webClient.request.session.deckList();
  }, DECK_LIST_REFETCH_DEBOUNCE_MS);
}
