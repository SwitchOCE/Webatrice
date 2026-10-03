import type { RelatedCardKind } from '@app/components';
import type { DetailTarget, ScryfallDetail, ScryfallDetailFace } from '@app/services';

import type { DeckCard } from './types';

/**
 * Card-detail dialog rules on top of the shared Scryfall detail record
 * (`services/scryfall/cardDetail.ts`): which deck row the dialog's
 * actions apply to and what it shows.
 */

/** A related card the user browsed to from the original row. */
export interface BrowsedCard extends DetailTarget {
  kind: RelatedCardKind;
}

/**
 * The deck row the dialog's actions apply to, or -1. Not browsing: the
 * clicked row, found by (name, category) — unique because adding a card
 * increments its existing row. Browsing a related card: its main row,
 * else any row with that name (commanders live in main).
 */
export function resolveDetailRow(
  deckCards: DeckCard[],
  snapshot: DeckCard,
  browsed: BrowsedCard | null,
): number {
  if (!browsed) {
    return deckCards.findIndex((c) => c.name === snapshot.name && c.category === snapshot.category);
  }
  const mainIdx = deckCards.findIndex((c) => c.name === browsed.name && c.category === 'main');
  if (mainIdx >= 0) {
    return mainIdx;
  }
  return deckCards.findIndex((c) => c.name === browsed.name);
}

export interface CardDetailView {
  name: string;
  imageUrl?: string;
  typeLine: string;
  oracle: string;
  flavor: string;
  manaCost: string;
  cmc?: number;
  setCode?: string;
  collectorNumber?: string;
}

/**
 * What the dialog shows. Face fields win over the top-level record (a
 * DFC back face shows its own text, art and cost); Scryfall data wins
 * over the deck row; the clicked row's own fields are only a fallback
 * when not browsing, so a browsed token never inherits them.
 */
export function describeCardDetail({
  detail,
  face,
  activeName,
  liveCard,
  fallback,
}: {
  detail: ScryfallDetail | null;
  face: ScryfallDetailFace | undefined;
  activeName: string;
  liveCard: DeckCard | null;
  fallback: Partial<DeckCard>;
}): CardDetailView {
  // A picked face with no mana cost (a transform back face) has no CMC
  // of its own — don't inherit the front's. Face CMC (MDFCs) wins.
  const cmc = (() => {
    if (face) {
      if (!(face.mana_cost ?? '')) {
        return undefined;
      }
      if (typeof face.cmc === 'number') {
        return face.cmc;
      }
    }
    return typeof detail?.cmc === 'number' ? detail.cmc : liveCard?.cmc ?? fallback.cmc;
  })();
  return {
    name: face?.name ?? activeName,
    imageUrl:
      face?.image_uris?.normal
      ?? face?.image_uris?.large
      ?? detail?.image_uris?.normal
      ?? detail?.image_uris?.large,
    typeLine: face?.type_line ?? detail?.type_line ?? liveCard?.typeLine ?? fallback.typeLine ?? '',
    oracle: face?.oracle_text ?? detail?.oracle_text ?? '',
    flavor: face?.flavor_text ?? detail?.flavor_text ?? '',
    manaCost: face?.mana_cost ?? detail?.mana_cost ?? liveCard?.manaCost ?? fallback.manaCost ?? '',
    cmc,
    setCode: detail?.set ?? liveCard?.set ?? fallback.set,
    collectorNumber: detail?.collector_number ?? liveCard?.collectorNumber ?? fallback.collectorNumber,
  };
}

/**
 * Only real, deckable cards can be added from a browsed related card:
 * the other half of a meld or a combo piece. A face is the same physical
 * card, a meld result is not shuffled in, and tokens are made in game.
 */
export function canAddBrowsedCard(kind: RelatedCardKind): boolean {
  return kind === 'meld_part' || kind === 'combo_piece';
}
