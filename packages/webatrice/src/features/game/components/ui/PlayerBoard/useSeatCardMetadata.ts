import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cardOverride,
  cleanScryfallName,
  lookupCards,
  type LookupCardFace,
  type LookupResult,
  type RelatedCardRef,
} from '@app/services';
import { useCardDataPreferences } from '@app/hooks';

import type { FilterableCard } from '../../../utils/cardFilter';
import {
  gameCardImageUrl, lookupGameCard, primeGameCards, resolveGameImagePrinting,
} from '../../../services/cardImages';
import type { BattlefieldCardViewModel, SeatDeckCard } from './playerBoard.types';

export interface SeatCardMeta {
  typeLine: string;
  pt?: string;
  cipt?: boolean;
  tableRow?: number;
  manaCost?: string;
  cmc?: number;
  colors?: string[];
  power?: string;
  toughness?: string;
  /** Names of tokens (and other related cards) this card
   *  references — powers the "Token: …" items at the bottom of
   *  the right-click menu, matching Cockatrice's
   *  addRelatedCardActions (card_menu.cpp:407-479). Undefined
   *  when the source does not carry relations or the
   *  card genuinely has none. */
  related?: RelatedCardRef[];
  /** Scryfall layout ("transform", "modal_dfc", etc.) — gates
   *  the "Token: Transform into …" menu item. Undefined for
   *  cards.xml-only sources (Cockatrice XML doesn't carry
   *  layout info). */
  layout?: string;
  /** Face data for multi-faced cards. Populated from Scryfall
   *  `card_faces`. Powers the transform target lookup: the
   *  non-current face becomes the new-token payload for
   *  Command_CreateToken with target_mode=TRANSFORM_INTO. */
  faces?: LookupCardFace[];
}

export function seatCardMetaFromLookup(r: LookupResult, name = r.name): SeatCardMeta {
  const face = r.faces?.find((entry) => cleanScryfallName(entry.name).toLowerCase() === cleanScryfallName(name).toLowerCase());
  const power = face?.power ?? r.power;
  const toughness = face?.toughness ?? r.toughness;
  const pt =
    power != null && toughness != null
      ? `${power}/${toughness}`
      : undefined;
  return {
    typeLine: face?.typeLine ?? r.typeLine ?? '',
    pt,
    cipt: r.cipt,
    tableRow: r.tableRow,
    manaCost: face?.manaCost ?? r.manaCost,
    cmc: r.cmc,
    colors: face?.colors ?? r.colors,
    power,
    toughness,
    related: r.related,
    layout: r.layout,
    faces: r.faces,
  };
}

const NO_OTHER_CARDS: readonly (readonly { name: string }[])[] = [];

export interface UseSeatCardMetadataArgs {
  isSelf: boolean;
  deckCards: readonly SeatDeckCard[];
  battlefieldCards: readonly BattlefieldCardViewModel[];
  otherVisibleCards?: readonly (readonly { name: string }[])[];
}

export function useSeatCardMetadata({
  isSelf,
  deckCards,
  battlefieldCards,
  otherVisibleCards = NO_OTHER_CARDS,
}: UseSeatCardMetadataArgs) {
  const cardDataPreferences = useCardDataPreferences();
  // Prefetch every deck card's metadata (`type_line` for hand
  // double-click auto-routing + `power`/`toughness` for the P/T pill
  // on the battlefield). The .cod XML we upload doesn't carry either,
  // so we backfill from the Dexie card DB (Cockatrice XML import) and
  // fall back to Scryfall on miss. Cached by card name because that's
  // what both consumers have cheaply available.
  // Card metadata cache keyed by name. Consumed by:
  //   • Battlefield P/T pills (typeLine + pt).
  //   • Card context menu's currentPT fallback.
  // The .cod XML we upload doesn't carry these fields, so we backfill
  // from the Dexie card DB (Cockatrice XML import) and fall back to
  // Scryfall on miss.
  const [cardMetaByName, setCardMetaByName] = useState<Map<string, SeatCardMeta>>(() => new Map());
  // Resolved token records (full LookupResult per token) keyed by
  // TOKEN name. Populated as battlefield cards' related lists land —
  // see the tokenMetaByName effect below. Tokens are just cards to
  // Scryfall, so we reuse `lookupCard` (which hits Dexie's
  // scryfallCache first, network second) to enrich them. The map
  // stores `LookupResult` so downstream can read power/toughness/
  // colors/printings directly.
  const [tokenMetaByName, setTokenMetaByName] = useState<
    Map<string, LookupResult>
  >(() => new Map());

  const resolveFaceImageUri = (cardName: string): string | undefined => {
    const faces = cardMetaByName.get(cardName)?.faces;
    return faces?.find((face) => cleanScryfallName(face.name).toLowerCase() === cleanScryfallName(cardName).toLowerCase())?.imageUri;
  };
  useEffect(() => {
    if (!isSelf) {
      return;
    }
    let cancelled = false;
    void primeGameCards(deckCards.map((card) => card.name));
    for (const card of deckCards.filter((entry) => !entry.sideboard)) {
      void lookupGameCard(card.name).then((lookup) => resolveGameImagePrinting(lookup, card.scryfallId, card.name)).then((lookup) => {
        const url = gameCardImageUrl(card, lookup);
        if (!cancelled && url) {
          const image = new Image();
          image.src = url;
        }
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isSelf, deckCards]);
  useEffect(() => {
    if (!isSelf || deckCards.length === 0) {
      return;
    }
    let cancelled = false;
    // Include sideboard cards in the Scryfall metadata fetch —
    // the sideboard viewer's Group by Type / Sort by CMC / etc.
    // dropdowns need the same enrichment as the main deck view.
    // Sideboard cards were previously filtered out under the
    // assumption they wouldn't be inspected in-game.
    const uniqueNames = Array.from(
      new Set(deckCards.map((c) => c.name)),
    ).filter((name) => !cardMetaByName.has(name));
    if (uniqueNames.length === 0) {
      return;
    }
    void (async () => {
      const results = await Promise.all(
        uniqueNames.map(async (name) => {
          const { card } = await lookupGameCard(name);
          return card.found ? [name, seatCardMetaFromLookup(card, name)] as const : null;
        }),
      );
      if (cancelled) {
        return;
      }
      setCardMetaByName((prev) => {
        const next = new Map(prev);
        for (const entry of results) {
          if (entry) {
            next.set(...entry);
          }
        }
        return next;
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // cardMetaByName intentionally omitted: we don't want an
    // "already-cached names" recomputation to re-enter the effect,
    // just want a re-run when the deck changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [isSelf, deckCards]);

  // Fetch Scryfall metadata for cards currently on the battlefield
  // — runs for BOTH self and opponent seats. The initial deck-
  // driven lookup above (gated to `isSelf` because opponent decks
  // aren't wired) only ever populates the local player's own card
  // names, so opponent creatures had no printed-PT fallback and
  // rendered without their P/T pill. This effect closes that gap by
  // enriching whatever appears on the battlefield right now, so an
  // opponent's Grizzly Bears reads "2/2" the same as one you cast
  // yourself. Skipped when the deck-driven effect above already
  // covered the name (has-check). The stack, graveyard, exile and open
  // zone views are enriched too, so their card menus offer "View related
  // cards" for an opponent's cards as well.
  useEffect(() => {
    const visible = [battlefieldCards, ...otherVisibleCards].flat();
    if (visible.length === 0) {
      return;
    }
    let cancelled = false;
    const uniqueNames = Array.from(
      new Set(visible.map((c) => c.name)),
    ).filter((name) => name && !cardMetaByName.has(name));
    if (uniqueNames.length === 0) {
      return;
    }
    void primeGameCards(uniqueNames);
    void (async () => {
      const results = await Promise.all(
        uniqueNames.map(async (name) => {
          const { card } = await lookupGameCard(name);
          return card.found ? [name, seatCardMetaFromLookup(card, name)] as const : null;
        }),
      );
      if (cancelled) {
        return;
      }
      setCardMetaByName((prev) => {
        const next = new Map(prev);
        for (const entry of results) {
          if (entry) {
            next.set(...entry);
          }
        }
        return next;
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // cardMetaByName intentionally omitted for the same reason as
    // the deck-driven effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [battlefieldCards, otherVisibleCards]);

  // Resolve related-card metadata for every parent card that has a
  // related list. Powers the "Token: …" right-click menu items
  // (Cockatrice's addRelatedCardActions, card_menu.cpp:407-479).
  //
  // Tokens (and transform back-faces) are just cards to Scryfall —
  // `lookupCards` hits the persistent scryfallCache first and only
  // reaches the network for names we've never seen. Batched to keep
  // network traffic to at most one /cards/collection round-trip per
  // effect firing (75 identifiers per request, chunked internally).
  //
  // Runs whenever cardMetaByName grows (new card seen with related
  // list). Skips names already resolved so re-runs are cheap.
  useEffect(() => {
    const needed: string[] = [];
    for (const meta of cardMetaByName.values()) {
      if (!meta.related) {
        continue;
      }
      for (const ref of meta.related) {
        if (!tokenMetaByName.has(ref.name)) {
          needed.push(ref.name);
        }
      }
    }
    const uniqueNeeded = Array.from(new Set(needed));
    if (uniqueNeeded.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await lookupCards(uniqueNeeded);
      if (cancelled) {
        return;
      }
      setTokenMetaByName((prev) => {
        const next = new Map(prev);
        for (const name of uniqueNeeded) {
          const r = results.get(name);
          if (r?.found || r?.notFound) {
            next.set(name, r);
          }
        }
        return next;
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // tokenMetaByName intentionally omitted — its own updates would
    // otherwise re-enter the effect. Re-runs when cardMetaByName
    // gains new entries with related lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [cardMetaByName]);

  const describeCard = useCallback((cardName: string): FilterableCard => {
    const meta = cardMetaByName.get(cardName);
    return {
      name: cardName,
      typeLine: meta?.typeLine,
      cmc: meta?.cmc,
      colors: meta?.colors,
      power: meta?.power,
      toughness: meta?.toughness,
    };
  }, [cardMetaByName]);

  const currentTokenMetaByName = useMemo(() => {
    const next = new Map<string, LookupResult>();
    for (const [name, meta] of tokenMetaByName) {
      const { pinnedPrintingId: _stalePin, ...withoutPin } = meta;
      const pinnedPrintingId = cardOverride(cardDataPreferences.value?.cardOverrides, name);
      next.set(name, pinnedPrintingId ? { ...withoutPin, pinnedPrintingId } : withoutPin);
    }
    return next;
  }, [tokenMetaByName, cardDataPreferences.value]);

  return {
    cardMetaByName,
    setCardMetaByName,
    tokenMetaByName: currentTokenMetaByName,
    resolveFaceImageUri,
    describeCard,
  };
}
