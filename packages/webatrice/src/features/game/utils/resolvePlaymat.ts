import type { games } from '@cockatrice/datatrice';

import { PlaymatFallbackBehavior, PlaymatMode, type PlaymatSettings } from '@app/hooks';

export function samePlaymat(a: games.Playmat | null, b: games.Playmat | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.cardName === b.cardName
    && a.cardProviderId === b.cardProviderId
    && a.params.marginPctL === b.params.marginPctL
    && a.params.marginPctR === b.params.marginPctR
    && a.params.verticalOffset === b.params.verticalOffset
    && a.params.zoom === b.params.zoom;
}

function pickFromCollection(
  settings: PlaymatSettings,
  rotationIndex: number,
  lastResolved: games.Playmat | null,
  random: () => number,
): games.Playmat | null {
  const list = settings.fallbackList;
  if (list.length === 0) {
    return null;
  }
  switch (settings.fallbackBehavior) {
    case PlaymatFallbackBehavior.ROUND_ROBIN:
      return list[rotationIndex % list.length];
    case PlaymatFallbackBehavior.RANDOM: {
      // With two or more entries, never repeat the previous pick
      // (DeckViewContainer::resolveAndSendPlaymat).
      const candidates = list.length > 1 ? list.filter((entry) => !samePlaymat(entry, lastResolved)) : list;
      const pool = candidates.length > 0 ? candidates : list;
      return pool[Math.floor(random() * pool.length)];
    }
    default:
      return list[0];
  }
}

/**
 * The playmat to announce for a deck, per the user's collection mode. Port of
 * desktop `resolvePlaymatForDeck` (playmat_resolver.cpp): override uses only
 * the collection, fallback prefers the deck's own playmat, deck-only ignores
 * the collection. Null when nothing in the chain resolves, which clears it.
 */
export function resolvePlaymat(
  deckPlaymat: games.Playmat | null,
  settings: PlaymatSettings,
  rotationIndex: number,
  lastResolved: games.Playmat | null = null,
  random: () => number = Math.random,
): games.Playmat | null {
  switch (settings.mode) {
    case PlaymatMode.OVERRIDE_DECK:
      return pickFromCollection(settings, rotationIndex, lastResolved, random);
    case PlaymatMode.DECK_ONLY:
      return deckPlaymat;
    default:
      return deckPlaymat ?? pickFromCollection(settings, rotationIndex, lastResolved, random);
  }
}
