import { ScryfallImageSize } from '@cockatrice/datatrice';

import {
  getScryfallUrlById,
  imageCandidatesOf,
  lookupCards,
  parseCod,
  primaryImageUri,
  type LookupResult,
  type PrintingSummary,
} from '@app/services';
import type { ParsedCard, ParsedDeck } from '@app/types';

import type { DeckCard, HydratedDeck } from './types';

export async function hydrateDeck(parsed: ParsedDeck, signal?: AbortSignal): Promise<HydratedDeck> {
  const uniqueNames = Array.from(new Set(parsed.cards.map((c) => c.name)));
  const lookups = await lookupCards(uniqueNames, signal);

  const cards: DeckCard[] = parsed.cards.map((row) => {
    const lookup = lookups.get(row.name);
    return assembleDeckCard(row, lookup);
  });

  return {
    name: parsed.name,
    meta: parsed.meta,
    cards,
    // Default an absent/empty <format> element to `commander`. Older
    // decks (created before format support landed, or in tools that
    // don't set the field) get treated as commander decks in the
    // editor and the next autosave writes the element back into the
    // file. Callers that opened the deck read-only and never mutate
    // won't trigger a persist — the useDeckEditor DECK_DOWNLOADED
    // handler nudges an immediate save when the raw parse had no
    // format, so the file still catches up on first open.
    format: parsed.format?.trim() || 'commander',
    bannerCard: parsed.bannerCard,
    bannerCardProviderId: parsed.bannerCardProviderId,
    lastLoadedTimestamp: parsed.lastLoadedTimestamp,
    playmatXml: parsed.playmatXml,
    sideboardPlansXml: parsed.sideboardPlansXml,
    tagsXml: parsed.tagsXml,
    bracketAssessment: parsed.bracketAssessment,
  };
}

/** Convenience: fetch → parse → hydrate in one call. */
export async function loadDeckFromCod(xml: string, signal?: AbortSignal): Promise<HydratedDeck> {
  return hydrateDeck(parseCod(xml), signal);
}

export function assembleDeckCard(
  row: ParsedCard,
  lookup: LookupResult | undefined,
): DeckCard {
  if (!lookup || !lookup.found) {
    return {
      name: row.name,
      quantity: row.quantity,
      category: row.category,
      ...(row.isCommander ? { isCommander: true } : {}),
      set: row.set,
      collectorNumber: row.collectorNumber,
      scryfallId: row.scryfallId,
      lookupSource: 'unknown',
    };
  }

  const chosen = pickPrinting(row, lookup.printings);

  const fallbackImageUri = row.scryfallId
    ? getScryfallUrlById(row.scryfallId, ScryfallImageSize.Normal)
    : undefined;
  const imageUris = imageCandidatesOf({ imageUris: imageCandidatesOf(chosen), imageUri: fallbackImageUri });

  return {
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    ...(row.isCommander ? { isCommander: true } : {}),
    typeLine: lookup.typeLine,
    manaCost: lookup.manaCost,
    cmc: lookup.cmc,
    colors: lookup.colors,
    power: lookup.power,
    toughness: lookup.toughness,
    set: chosen?.set ?? row.set,
    collectorNumber: chosen?.collectorNumber ?? row.collectorNumber,
    scryfallId: chosen?.scryfallId ?? row.scryfallId,
    imageUri: primaryImageUri({ imageUris }),
    imageUris,
    lookupSource: lookup.source,
  };
}

function pickPrinting(
  hint: ParsedCard,
  printings: PrintingSummary[],
): PrintingSummary | undefined {
  if (!printings.length) {
    return undefined;
  }

  // Prefer an exact Scryfall id match.
  if (hint.scryfallId) {
    const byId = printings.find((p) => p.scryfallId === hint.scryfallId);
    if (byId) {
      return byId;
    }
    // A scryfallId hint that Dexie can't resolve means the user picked
    // a printing from Scryfall that's not in their imported card DB.
    // Returning undefined preserves the hint values in assembleDeckCard
    // (set/collectorNumber/scryfallId flow through from `row.*`).
    return undefined;
  }

  // Set-hint fallback: same "don't silently substitute" rule applies.
  if (hint.set) {
    const bySet = printings.find(
      (p) =>
        p.set?.toLowerCase() === hint.set!.toLowerCase() &&
        (!hint.collectorNumber || p.collectorNumber === hint.collectorNumber),
    );
    if (bySet) {
      return bySet;
    }
    return undefined;
  }

  return printings[0];
}
