import { serializeCod } from '@app/services';

import type { DeckCard, HydratedDeck } from './types';

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
    playmatXml: deck.playmatXml,
    tagsXml: deck.tagsXml,
    bracketAssessment: deck.bracketAssessment,
  });
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/**
 * The deck's color identity as desktop's `getDeckColorIdentity` computes it
 * for a save: the union of the colors of every main and sideboard card, in
 * WUBRG order. Cards whose data hasn't loaded contribute nothing, as unknown
 * cards do on desktop. 3.1 servers store it beside the deck (and overwrite it
 * on every update).
 */
export function deckColorIdentity(cards: readonly DeckCard[]): string {
  const colors = new Set<string>();
  // Every card is main or sideboard, the two zones desktop reads.
  for (const card of cards) {
    for (const color of card.colors ?? []) {
      colors.add(color.toUpperCase());
    }
  }
  return WUBRG.filter((c) => colors.has(c)).join('');
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
    playmatXml: deck.playmatXml ?? null,
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
