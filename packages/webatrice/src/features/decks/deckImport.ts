import { defaultMeta, lookupCards, serializeCod, type LookupResult } from '@app/services';
import type { DeckCategory, ParsedDeck } from '@app/types';

import type { ParsedEntry } from './decklistParser';
import { assembleDeckCard } from './hydrate';
import type { DeckCard } from './types';

/**
 * Import pipeline for the MyDecks importer: a pasted decklist is
 * resolved against the card catalog and turned into `.cod` XML; a
 * `.cod` file is re-serialized with the user's name and format.
 */

export interface ResolvedImportRow {
  entry: ParsedEntry;
  lookup: LookupResult;
}

/**
 * Resolve parsed decklist entries through the card catalog (Dexie first,
 * Scryfall fallback). Set + collector travel with the name so Scryfall's
 * collection batch can identify freshly printed / Universes Beyond cards
 * by exact printing instead of fuzzy-matching on name. Duplicates by name
 * resolve once — the first hint wins. Unknown names come back as
 * `found: false` rows rather than being dropped.
 */
export async function resolveImportEntries(entries: ParsedEntry[]): Promise<ResolvedImportRow[]> {
  const uniqueHints = new Map<string, { name: string; set?: string; collectorNumber?: string }>();
  for (const e of entries) {
    if (!uniqueHints.has(e.name)) {
      uniqueHints.set(e.name, { name: e.name, set: e.set, collectorNumber: e.collectorNumber });
    }
  }
  const lookupMap = await lookupCards(Array.from(uniqueHints.values()));
  return entries.map((entry) => ({
    entry,
    lookup: lookupMap.get(entry.name) ?? {
      found: false,
      source: 'unknown',
      name: entry.name,
      printings: [],
    },
  }));
}

/** Matched / unknown card totals (by quantity) for the review step. */
export function countResolvedRows(rows: ResolvedImportRow[]): { matched: number; missing: number } {
  let matched = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.lookup.found) {
      matched += r.entry.quantity;
    } else {
      missing += r.entry.quantity;
    }
  }
  return { matched, missing };
}

/**
 * `.cod` XML for a reviewed paste. Unmatched entries are kept — the
 * editor flags them (`lookupSource: 'unknown'`) so typos can be fixed.
 */
export function buildPastedDeckCod(rows: ResolvedImportRow[], name: string, format: string): string {
  const cards: DeckCard[] = rows.map((r) => assembleDeckCard(r.entry, r.lookup));
  return serializeCod({
    name: name.trim() || 'Imported deck',
    meta: defaultMeta(),
    cards,
    format: format.trim().toLowerCase() || 'commander',
  });
}

/**
 * `.cod` XML for an uploaded file: applies the typed name (else the
 * file's) and format (else the file's) while preserving the file's
 * metadata, printing hints and desktop bookkeeping elements.
 */
export function buildUploadedDeckCod(file: ParsedDeck, name: string, format: string): string {
  return serializeCod({
    name: name.trim() || file.name || 'Imported deck',
    meta: file.meta,
    // Parsed cards carry set/collector/scryfallId hints that serializeCod
    // emits back onto the <card> attributes.
    cards: file.cards as unknown as DeckCard[],
    format: format.trim().toLowerCase() || file.format || 'commander',
    bannerCard: file.bannerCard,
    lastLoadedTimestamp: file.lastLoadedTimestamp,
    tagsXml: file.tagsXml,
  });
}

/** Per-zone card totals for the uploaded-file summary card. */
export function summarizeUploadedDeck(file: ParsedDeck): { total: number; parts: string[] } {
  const totals = file.cards.reduce(
    (acc, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + c.quantity;
      return acc;
    },
    {} as Partial<Record<DeckCategory, number>>,
  );
  const total = file.cards.reduce((sum, c) => sum + c.quantity, 0);
  const parts: string[] = [];
  if (totals.main) {
    parts.push(`${totals.main} main`);
  }
  if (totals.sideboard) {
    parts.push(`${totals.sideboard} sideboard`);
  }
  return { total, parts };
}
