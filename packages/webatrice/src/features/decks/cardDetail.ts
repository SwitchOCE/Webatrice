import type { RelatedCardKind } from '@app/components';

import type { DeckCard } from './types';

/**
 * Card-detail dialog data: the Scryfall record behind a deck row (or a
 * related card browsed from it), and the rules for which face and which
 * deck row the dialog shows.
 */

/** Scryfall fields the detail view renders — a superset of `DeckCard`. */
export interface ScryfallDetail {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  set?: string;
  collector_number?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  card_faces?: Array<ScryfallDetailFace>;
  /** Scryfall `all_parts` — tokens, meld pieces, combo pieces. Powers the
   *  "Related" links rendered by CardRelatedLinks. */
  all_parts?: Array<{
    id?: string;
    name?: string;
    component?: string;
  }>;
}

export interface ScryfallDetailFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  mana_cost?: string;
  /** Face-level CMC. Scryfall only populates this on MDFCs and reversible
   *  cards — transform DFCs put CMC on the top-level record only, and
   *  their back face has no mana cost at all. */
  cmc?: number;
  image_uris?: { small?: string; normal?: string; large?: string };
}

/** The card a detail fetch targets: an exact printing when known, else a name. */
export interface DetailTarget {
  name: string;
  scryfallId?: string;
}

/** A related card the user browsed to from the original row. */
export interface BrowsedCard extends DetailTarget {
  kind: RelatedCardKind;
}

const TOKEN_SUFFIX_RE = /\s*\(?\bToken\b\)?\s*$/i;

/** Cache / refetch key for a detail target. */
export function detailTargetKey(target: DetailTarget): string {
  return target.scryfallId ?? `name:${target.name}`;
}

/**
 * Fetch a card's full Scryfall record: by id when known, else by exact
 * name (a trailing "Token" suffix stripped). `null` on HTTP or network
 * failure; an abort is rethrown so the caller can ignore it.
 */
export async function fetchScryfallDetail(
  scryfallId: string | undefined,
  name: string,
  signal?: AbortSignal,
): Promise<ScryfallDetail | null> {
  try {
    let url: string;
    if (scryfallId) {
      url = `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`;
    } else {
      const cleaned = name.replace(TOKEN_SUFFIX_RE, '');
      url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleaned)}`;
    }
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as ScryfallDetail;
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      throw e;
    }
    return null;
  }
}

/**
 * The face to show for `activeName`, so clicking "Other face" on a DFC
 * flips to the back face's data. First match wins:
 *   1. exact (case-insensitive);
 *   2. exact after stripping a "Token" suffix (all_parts names and face
 *      names disagree on it);
 *   3. face name contained in the active name (chip more specific);
 *   4. active name contained in the face name (chip more general);
 *   5. the first face.
 * The substring steps catch double-faced tokens whose all_parts names
 * don't line up with the record's faces. `undefined` for single-faced
 * cards.
 */
export function selectCardFace(
  detail: ScryfallDetail | null,
  activeName: string,
): ScryfallDetailFace | undefined {
  const faces = detail?.card_faces;
  if (!faces || faces.length === 0) {
    return undefined;
  }
  const stripToken = (s: string) => s.replace(TOKEN_SUFFIX_RE, '').trim();
  const active = activeName.toLowerCase();
  const activeStripped = stripToken(activeName).toLowerCase();
  return (
    faces.find((f) => f.name?.toLowerCase() === active)
    ?? faces.find((f) => f.name && stripToken(f.name).toLowerCase() === activeStripped)
    ?? faces.find((f) => f.name && active.includes(f.name.toLowerCase()))
    ?? faces.find((f) => f.name?.toLowerCase().includes(active))
    ?? faces[0]
  );
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
