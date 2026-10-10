import type { TFunction } from 'i18next';

import { lookupCards, serializeCod, type LookupResult } from '@app/services';
import type { DeckCategory, ParsedCard, ParsedDeck } from '@app/types';

import { deckColorIdentity } from './deckPersistence';
import { assembleDeckCard } from './hydrate';
import type { DeckCard } from './types';

export type ImportEntry = Omit<ParsedCard, 'category'> & { category: DeckCategory };

export interface ResolvedImportRow {
  entry: ImportEntry;
  lookup: LookupResult;
  hintDropped?: boolean;
}

function unknownLookup(name: string): LookupResult {
  return { found: false, source: 'unknown', name, printings: [] };
}

function hasHint(entry: ImportEntry): boolean {
  return Boolean(entry.set || entry.collectorNumber || entry.scryfallId);
}

function uniqueByName<T extends { name: string }>(items: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.name)) {
      seen.set(item.name, item);
    }
  }
  return Array.from(seen.values());
}

export async function resolveImportEntries(entries: readonly ImportEntry[]): Promise<ResolvedImportRow[]> {
  const hints = uniqueByName(entries).map((e) => ({
    name: e.name,
    set: e.set,
    collectorNumber: e.collectorNumber,
    ...(e.scryfallId ? { scryfallId: e.scryfallId } : {}),
  }));
  const lookupMap = await lookupCards(hints);
  const misses = uniqueByName(entries.filter((e) => hasHint(e) && !lookupMap.get(e.name)?.found));
  const byName = misses.length ? await lookupCards(misses.map((e) => e.name)) : new Map<string, LookupResult>();
  return entries.map((entry) => {
    const hinted = lookupMap.get(entry.name);
    if (hinted?.found) {
      return { entry, lookup: hinted };
    }
    const named = byName.get(entry.name);
    if (named?.found) {
      return { entry, lookup: named, hintDropped: true };
    }
    return { entry, lookup: hinted ?? unknownLookup(entry.name) };
  });
}

function rowCard({ entry, lookup, hintDropped }: ResolvedImportRow): DeckCard {
  const row: ParsedCard = hintDropped
    ? { name: entry.name, quantity: entry.quantity, category: entry.category, isCommander: entry.isCommander, zonePath: entry.zonePath }
    : entry;
  return assembleDeckCard(row, lookup);
}

export function resolvedImportColorIdentity(rows: readonly ResolvedImportRow[]): string {
  return deckColorIdentity(rows.map(rowCard));
}

export function countResolvedRows(rows: readonly ResolvedImportRow[]): { matched: number; missing: number } {
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

export function buildImportedDeckCod(
  deck: ParsedDeck,
  rows: readonly ResolvedImportRow[],
  { name, format, t }: { name: string; format: string; t: TFunction },
): string {
  return serializeCod({
    name: name.trim() || deck.name || t('DeckImport.defaultName'),
    meta: deck.meta,
    cards: rows.map(rowCard),
    format: format.trim().toLowerCase(),
    bannerCard: deck.bannerCard,
    bannerCardProviderId: deck.bannerCardProviderId,
    lastLoadedTimestamp: deck.lastLoadedTimestamp,
    playmatXml: deck.playmatXml,
    sideboardPlansXml: deck.sideboardPlansXml,
    extraZonesXml: deck.extraZonesXml,
    tagsXml: deck.tagsXml,
  });
}

export function summarizeImportRows(rows: readonly ResolvedImportRow[]): { total: number; main: number; sideboard: number } {
  let main = 0;
  let sideboard = 0;
  for (const { entry } of rows) {
    if (entry.category === 'sideboard') {
      sideboard += entry.quantity;
    } else {
      main += entry.quantity;
    }
  }
  return { total: main + sideboard, main, sideboard };
}
