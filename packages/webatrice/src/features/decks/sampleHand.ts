import type { DeckCard } from './types';

/**
 * Sample hand — desktop `VisualDeckEditorSampleHandWidget::getRandomCards`:
 * shuffle the main deck (one entry per copy), take the first N, and show
 * them sorted by mana value. Nothing here touches the deck.
 */

/** Desktop's default `sampleHandSize`; the spin box minimum is 1. */
export const DEFAULT_SAMPLE_HAND_SIZE = 7;
export const MIN_SAMPLE_HAND_SIZE = 1;

/**
 * The library a hand is drawn from: every main-deck copy. The sideboard is
 * left out, as on desktop; so is a designated commander, which starts in
 * the command zone rather than the library.
 */
export function sampleLibrary(cards: readonly DeckCard[]): DeckCard[] {
  const library: DeckCard[] = [];
  for (const card of cards) {
    if (card.category !== 'main' || card.isCommander) {
      continue;
    }
    for (let i = 0; i < card.quantity; i++) {
      library.push(card);
    }
  }
  return library;
}

/**
 * Up to `size` random cards from `library`, sorted by mana value. `random`
 * returns a float in [0, 1) and is injectable for deterministic tests.
 */
export function drawSampleHand(
  library: readonly DeckCard[],
  size: number,
  random: () => number = Math.random,
): DeckCard[] {
  const shuffled = library.slice();
  // Fisher–Yates.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Desktop compares the card DB's text cmc; a numeric sort keeps 10 after 2.
  return shuffled
    .slice(0, Math.max(0, Math.min(size, shuffled.length)))
    .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0));
}

/** A typed hand size, clamped to at least `MIN_SAMPLE_HAND_SIZE`. */
export function clampHandSize(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_SAMPLE_HAND_SIZE, Math.floor(value)) : DEFAULT_SAMPLE_HAND_SIZE;
}
