import type { TFunction } from 'i18next';

import { defaultMeta, lookupCards, serializeCod, type LookupResult } from '@app/services';
import type { DeckCategory, ParsedDeck } from '@app/types';

import { deckColorIdentity } from './deckPersistence';
import type { ParsedEntry } from './decklistParser';
import { assembleDeckCard } from './hydrate';
import type { DeckCard } from './types';

export interface ResolvedImportRow {
  entry: ParsedEntry;
  lookup: LookupResult;
}

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

export function resolvedImportColorIdentity(rows: ResolvedImportRow[]): string {
  return deckColorIdentity(rows.map((r) => assembleDeckCard(r.entry, r.lookup)));
}

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

export function buildPastedDeckCod(rows: ResolvedImportRow[], name: string, format: string, t: TFunction): string {
  const cards: DeckCard[] = rows.map((r) => assembleDeckCard(r.entry, r.lookup));
  return serializeCod({
    name: name.trim() || t('DeckImport.defaultName'),
    meta: defaultMeta(),
    cards,
    format: format.trim().toLowerCase() || 'commander',
  });
}

export function buildUploadedDeckCod(file: ParsedDeck, name: string, format: string, t: TFunction): string {
  return serializeCod({
    name: name.trim() || file.name || t('DeckImport.defaultName'),
    meta: file.meta,
    cards: file.cards as unknown as DeckCard[],
    format: format.trim().toLowerCase() || file.format || 'commander',
    bannerCard: file.bannerCard,
    bannerCardProviderId: file.bannerCardProviderId,
    lastLoadedTimestamp: file.lastLoadedTimestamp,
    playmatXml: file.playmatXml,
    sideboardPlansXml: file.sideboardPlansXml,
    tagsXml: file.tagsXml,
  });
}

export function summarizeUploadedDeck(file: ParsedDeck): { total: number; main: number; sideboard: number } {
  const totals = file.cards.reduce(
    (acc, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + c.quantity;
      return acc;
    },
    {} as Partial<Record<DeckCategory, number>>,
  );
  const total = file.cards.reduce((sum, c) => sum + c.quantity, 0);
  return { total, main: totals.main ?? 0, sideboard: totals.sideboard ?? 0 };
}
