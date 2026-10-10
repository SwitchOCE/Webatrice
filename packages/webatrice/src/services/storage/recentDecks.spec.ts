import { vi } from 'vitest';

import {
  getRecentDecks,
  parseRecentDecks,
  recentDeckArtUrl,
  recentDeckSnapshot,
  recordRecentDeck,
  RECENT_DECKS_STORAGE_KEY,
  resetRecentDecksCache,
  subscribeRecentDecks,
  withRecentDeck,
  type RecentDeck,
  type RecentDeckSource,
} from './recentDecks';

const SCRYFALL_ID = '0b9a7a0b-8f8e-4b0f-9a8c-1f1e1d1c1b1a';

const source = (overrides: Partial<RecentDeckSource> = {}): RecentDeckSource => ({
  name: 'Atraxa',
  format: 'commander',
  meta: {},
  cards: [
    {
      name: 'Atraxa, Praetors\' Voice',
      quantity: 1,
      category: 'main',
      colors: ['G', 'W', 'U', 'B'],
      isCommander: true,
      scryfallId: SCRYFALL_ID,
    },
    { name: 'Sol Ring', quantity: 1, category: 'main' },
    { name: 'Lightning Bolt', quantity: 3, category: 'sideboard', colors: ['R'] },
  ],
  ...overrides,
});

const entry = (deckId: number, overrides: Partial<RecentDeck> = {}): RecentDeck => ({
  ...recentDeckSnapshot('alice', deckId, source({ name: `Deck ${deckId}` }), deckId),
  ...overrides,
});

describe('recentDeckSnapshot', () => {
  it('counts the main deck and orders its colours WUBRG', () => {
    const snap = recentDeckSnapshot('alice', 4, source(), 10);
    expect(snap).toMatchObject({ owner: 'alice', deckId: 4, name: 'Atraxa', colors: 'WUBG', cardCount: 2, openedAt: 10 });
    expect(snap.commanderName).toBe('Atraxa, Praetors\' Voice');
  });

  it('prefers the bracket assessment over the cached level', () => {
    expect(recentDeckSnapshot('a', 1, source({ meta: { bracketLevel: 2 }, bracketAssessment: { level: 4 } }), 0).bracketLevel).toBe(4);
    expect(recentDeckSnapshot('a', 1, source({ meta: { bracketLevel: 2 } }), 0).bracketLevel).toBe(2);
  });
});

describe('recentDeckArtUrl', () => {
  it('uses the banner card, then the commander', () => {
    const banner = recentDeckSnapshot('a', 1, source({ bannerCard: 'Sol Ring' }), 0);
    expect(recentDeckArtUrl(banner)).toContain('Sol');
    const commander = recentDeckSnapshot('a', 1, source(), 0);
    expect(recentDeckArtUrl(commander)).toContain(SCRYFALL_ID);
    expect(recentDeckArtUrl(recentDeckSnapshot('a', 1, source({ cards: [] }), 0))).toBeNull();
  });
});

describe('withRecentDeck', () => {
  it('moves a reopened deck to the front without duplicating it', () => {
    const list = [entry(1), entry(2), entry(3)];
    expect(withRecentDeck(list, entry(2, { openedAt: 99 })).map((d) => d.deckId)).toEqual([2, 1, 3]);
  });

  it('keeps the same deck id of another account', () => {
    const list = [entry(1, { owner: 'bob' })];
    expect(withRecentDeck(list, entry(1))).toHaveLength(2);
  });

  it('caps the list', () => {
    expect(withRecentDeck([entry(1), entry(2)], entry(3), 2).map((d) => d.deckId)).toEqual([3, 1]);
  });
});

describe('parseRecentDecks', () => {
  it('drops malformed storage', () => {
    expect(parseRecentDecks('nope')).toEqual([]);
    expect(parseRecentDecks('{"a":1}')).toEqual([]);
    expect(parseRecentDecks(JSON.stringify([entry(1), { deckId: 'x' }]))).toEqual([entry(1)]);
  });
});

describe('recordRecentDeck', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetRecentDecksCache();
  });

  it('persists, notifies and skips writes that change nothing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRecentDecks(listener);
    recordRecentDeck(entry(1));
    recordRecentDeck(entry(1, { openedAt: 500 }));
    expect(listener).toHaveBeenCalledTimes(1);
    resetRecentDecksCache();
    expect(getRecentDecks()).toEqual([entry(1)]);
    expect(window.localStorage.getItem(RECENT_DECKS_STORAGE_KEY)).not.toBeNull();
    unsubscribe();
  });
});
