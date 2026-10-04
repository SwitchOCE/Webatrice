import { lookupCards, parseCod, type LookupResult } from '@app/services';
import type { TFunction } from 'i18next';

import type { ParsedDeck } from '@app/types';

import {
  buildPastedDeckCod,
  buildUploadedDeckCod,
  countResolvedRows,
  resolveImportEntries,
  summarizeUploadedDeck,
} from './deckImport';
import type { ParsedEntry } from './decklistParser';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCards: vi.fn(),
}));

const t = ((key: string) => key) as unknown as TFunction;

const solRing: LookupResult = {
  found: true,
  source: 'scryfall',
  name: 'Sol Ring',
  typeLine: 'Artifact',
  printings: [{ set: 'c21', collectorNumber: '263', scryfallId: 'id-sol' }],
};

describe('resolveImportEntries', () => {
  it('looks each name up once with its printing hint and keeps unknown names', async () => {
    vi.mocked(lookupCards).mockResolvedValue(new Map([['Sol Ring', solRing]]));
    const entries: ParsedEntry[] = [
      { name: 'Sol Ring', quantity: 1, category: 'main', set: 'C21', collectorNumber: '263' },
      { name: 'Sol Ring', quantity: 1, category: 'sideboard' },
      { name: 'Mystery', quantity: 2, category: 'main' },
    ];

    const rows = await resolveImportEntries(entries);

    expect(lookupCards).toHaveBeenCalledWith([
      { name: 'Sol Ring', set: 'C21', collectorNumber: '263' },
      { name: 'Mystery', set: undefined, collectorNumber: undefined },
    ]);
    expect(rows.map((r) => [r.entry.name, r.lookup.found])).toEqual([
      ['Sol Ring', true],
      ['Sol Ring', true],
      ['Mystery', false],
    ]);
    expect(rows[2].lookup).toEqual({ found: false, source: 'unknown', name: 'Mystery', printings: [] });
    expect(countResolvedRows(rows)).toEqual({ matched: 2, missing: 2 });
  });
});

describe('buildPastedDeckCod', () => {
  it('serializes every row with the typed name and lower-cased format', () => {
    const xml = buildPastedDeckCod(
      [
        { entry: { name: 'Sol Ring', quantity: 2, category: 'main' }, lookup: solRing },
        {
          entry: { name: 'Mystery', quantity: 1, category: 'sideboard' },
          lookup: { found: false, source: 'unknown', name: 'Mystery', printings: [] },
        },
      ],
      '  Pasted ',
      ' Modern ',
      t,
    );
    const deck = parseCod(xml);
    expect(deck.name).toBe('Pasted');
    expect(deck.format).toBe('modern');
    expect(deck.cards.map((c) => [c.name, c.quantity, c.category])).toEqual([
      ['Sol Ring', 2, 'main'],
      ['Mystery', 1, 'sideboard'],
    ]);
  });

  it('falls back to a default name and the commander format', () => {
    const deck = parseCod(buildPastedDeckCod([], ' ', '', t));
    expect(deck.name).toBe('DeckImport.defaultName');
    expect(deck.format).toBe('commander');
  });
});

describe('uploaded .cod files', () => {
  const file: ParsedDeck = {
    name: 'From Desktop',
    meta: { v: 1, updatedAt: '2026-01-01T00:00:00.000Z', description: 'kept', priceUsd: 9 },
    format: 'legacy',
    bannerCard: 'Sol Ring',
    lastLoadedTimestamp: '2026-01-02',
    cards: [
      { name: 'Lightning Bolt', quantity: 4, category: 'main', set: 'm11', collectorNumber: '149' },
      { name: 'Negate', quantity: 2, category: 'sideboard' },
    ],
  };

  it('keeps the file name and format unless the user typed their own', () => {
    const kept = parseCod(buildUploadedDeckCod(file, '', '', t));
    expect(kept.name).toBe('From Desktop');
    expect(kept.format).toBe('legacy');
    expect(kept.meta.description).toBe('kept');
    expect(kept.bannerCard).toBe('Sol Ring');
    expect(kept.lastLoadedTimestamp).toBe('2026-01-02');
    expect(kept.cards[0]).toEqual(expect.objectContaining({ set: 'm11', collectorNumber: '149' }));

    const renamed = parseCod(buildUploadedDeckCod(file, ' Mine ', 'Vintage', t));
    expect(renamed.name).toBe('Mine');
    expect(renamed.format).toBe('vintage');
  });

  it('summarizes card totals per zone', () => {
    expect(summarizeUploadedDeck(file)).toEqual({ total: 6, main: 4, sideboard: 2 });
  });
});
