import { serializeCod } from '@app/services';

import type { HydratedDeck } from './types';

/**
 * Saving an open deck back to Servatrice deck storage. The upload itself is
 * Sockatrice's `deckUpdate` (a deck-id replace, never a create); this module
 * owns what is sent and when a save is needed at all.
 */

/** The `.cod` XML an autosave uploads. `serializeCod` stamps `updatedAt`. */
export function serializeDeckForSave(deck: HydratedDeck): string {
  return serializeCod({
    name: deck.name,
    meta: deck.meta,
    cards: deck.cards,
    format: deck.format,
    bannerCard: deck.bannerCard,
    bannerCardProviderId: deck.bannerCardProviderId,
    lastLoadedTimestamp: deck.lastLoadedTimestamp,
    tagsXml: deck.tagsXml,
    bracketAssessment: deck.bracketAssessment,
  });
}

/**
 * Identity of everything a save writes, except the `updatedAt` stamp. The
 * autosave compares it with the last signature the server acknowledged, so a
 * deck is uploaded only when its content changed (comparing the serialized
 * XML could never match: every serialization stamps a new `updatedAt`).
 *
 * @critical Keep in step with `serializeDeckForSave`: a field written there but
 * left out here is a change the autosave would never upload.
 */
export function deckSaveSignature(deck: HydratedDeck): string {
  const { updatedAt: _stamp, ...meta } = deck.meta;
  return JSON.stringify({
    name: deck.name,
    meta,
    format: deck.format,
    bannerCard: deck.bannerCard ?? null,
    bannerCardProviderId: deck.bannerCardProviderId ?? null,
    lastLoadedTimestamp: deck.lastLoadedTimestamp ?? null,
    tagsXml: deck.tagsXml ?? null,
    bracketAssessment: deck.bracketAssessment ?? null,
    cards: deck.cards.map((c) => [
      c.name,
      c.quantity,
      c.category,
      c.isCommander === true,
      c.set ?? '',
      c.collectorNumber ?? '',
      c.scryfallId ?? '',
    ]),
  });
}
