import { ScryfallImageSize } from '@cockatrice/datatrice';

import { getScryfallUrlByExactName, getScryfallUrlById } from '../scryfall';
import { readLocalStorage, writeLocalStorage } from './localStorage';

export interface RecentDeck {
  owner: string;
  deckId: number;
  name: string;
  format: string;
  colors: string;
  cardCount: number;
  bracketLevel?: number;
  bannerCard?: string;
  bannerCardProviderId?: string;
  commanderName?: string;
  commanderScryfallId?: string;
  openedAt: number;
}

export interface RecentDeckSource {
  name: string;
  format: string;
  bannerCard?: string;
  bannerCardProviderId?: string;
  cards: ReadonlyArray<{
    name: string;
    quantity: number;
    category: string;
    colors?: string[];
    isCommander?: boolean;
    scryfallId?: string;
  }>;
  meta: { bracketLevel?: number };
  bracketAssessment?: { level: number };
}

export const RECENT_DECKS_STORAGE_KEY = 'webatrice.recentDecks';
export const RECENT_DECKS_LIMIT = 24;

const WUBRG = ['W', 'U', 'B', 'R', 'G'];
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recentDeckSnapshot(
  owner: string,
  deckId: number,
  deck: RecentDeckSource,
  openedAt: number,
): RecentDeck {
  const colors = new Set<string>();
  let cardCount = 0;
  for (const card of deck.cards) {
    if (card.category !== 'main') {
      continue;
    }
    cardCount += card.quantity;
    for (const color of card.colors ?? []) {
      colors.add(color.toUpperCase());
    }
  }
  const commander = deck.cards.find((card) => card.isCommander);
  const entry: RecentDeck = {
    owner,
    deckId,
    name: deck.name,
    format: deck.format,
    colors: WUBRG.filter((c) => colors.has(c)).join(''),
    cardCount,
    openedAt,
  };
  const bracketLevel = deck.bracketAssessment?.level ?? deck.meta.bracketLevel;
  if (bracketLevel != null) {
    entry.bracketLevel = bracketLevel;
  }
  if (deck.bannerCard?.trim()) {
    entry.bannerCard = deck.bannerCard.trim();
    if (deck.bannerCardProviderId) {
      entry.bannerCardProviderId = deck.bannerCardProviderId;
    }
  }
  if (commander) {
    entry.commanderName = commander.name;
    if (commander.scryfallId) {
      entry.commanderScryfallId = commander.scryfallId;
    }
  }
  return entry;
}

export function recentDeckArtUrl(deck: RecentDeck): string | null {
  if (deck.bannerCard) {
    return deck.bannerCardProviderId && SCRYFALL_ID.test(deck.bannerCardProviderId)
      ? getScryfallUrlById(deck.bannerCardProviderId, ScryfallImageSize.ArtCrop)
      : getScryfallUrlByExactName(deck.bannerCard, ScryfallImageSize.ArtCrop);
  }
  if (deck.commanderScryfallId && SCRYFALL_ID.test(deck.commanderScryfallId)) {
    return getScryfallUrlById(deck.commanderScryfallId, ScryfallImageSize.ArtCrop);
  }
  if (deck.commanderName?.trim()) {
    return getScryfallUrlByExactName(deck.commanderName.trim(), ScryfallImageSize.ArtCrop);
  }
  return null;
}

function isRecentDeck(value: unknown): value is RecentDeck {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Partial<RecentDeck>;
  return typeof v.owner === 'string'
    && typeof v.deckId === 'number'
    && typeof v.name === 'string'
    && typeof v.format === 'string'
    && typeof v.colors === 'string'
    && typeof v.cardCount === 'number'
    && typeof v.openedAt === 'number';
}

export function parseRecentDecks(raw: string | null): RecentDeck[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentDeck) : [];
  } catch {
    return [];
  }
}

function sameDeck(a: RecentDeck, b: RecentDeck): boolean {
  return a.owner === b.owner && a.deckId === b.deckId;
}

function sameContent(a: RecentDeck, b: RecentDeck): boolean {
  const { openedAt: _a, ...restA } = a;
  const { openedAt: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

export function withRecentDeck(list: readonly RecentDeck[], entry: RecentDeck, limit = RECENT_DECKS_LIMIT): RecentDeck[] {
  return [entry, ...list.filter((deck) => !sameDeck(deck, entry))].slice(0, limit);
}

let cache: RecentDeck[] | null = null;
const listeners = new Set<() => void>();

export function getRecentDecks(): RecentDeck[] {
  if (cache === null) {
    cache = parseRecentDecks(readLocalStorage(RECENT_DECKS_STORAGE_KEY));
  }
  return cache;
}

export function subscribeRecentDecks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordRecentDeck(entry: RecentDeck): void {
  const current = getRecentDecks();
  if (current[0] && sameDeck(current[0], entry) && sameContent(current[0], entry)) {
    return;
  }
  cache = withRecentDeck(current, entry);
  writeLocalStorage(RECENT_DECKS_STORAGE_KEY, JSON.stringify(cache));
  listeners.forEach((listener) => listener());
}

export function resetRecentDecksCache(): void {
  cache = null;
}
