import { useEffect, useRef, type RefObject } from 'react';

import type { DeckListSection } from '../deckSummary';
import type { FlatDeck } from '../deckTree';

/** Attribute on a deck list row that carries its deck id, so focus can find the row. */
export const DECK_LIST_ROW_ATTRIBUTE = 'data-deck-id';

/**
 * Focus after a confirmed deck delete. The dialog closes at once and hands focus back to the
 * row's Delete button, but the row unmounts only when the server confirms the delete, and focus
 * would then fall to `<body>`. Once the deck has left the list, focus moves to the next deck's
 * row (else the previous one), else to `fallbackRef`. Focus the user moved meanwhile stays put.
 *
 * Returns the function to call when a delete is confirmed.
 */
export function useDeckDeleteFocus(sections: readonly DeckListSection[], fallbackRef: RefObject<HTMLElement | null>) {
  const pending = useRef<{ deleted: number; neighbour: number | null } | null>(null);

  useEffect(() => {
    const target = pending.current;
    if (!target || sections.some(({ decks }) => decks.some((deck) => deck.id === target.deleted))) {
      return;
    }
    pending.current = null;
    if (document.activeElement != null && document.activeElement !== document.body) {
      return;
    }
    const row = target.neighbour != null
      ? document.querySelector<HTMLElement>(`[${DECK_LIST_ROW_ATTRIBUTE}="${target.neighbour}"] button`)
      : null;
    if (row) {
      row.focus();
      return;
    }
    const fallback = fallbackRef.current;
    if (fallback) {
      // Focusable only for this hand-over, so later clicks inside don't focus the container.
      fallback.setAttribute('tabindex', '-1');
      fallback.addEventListener('blur', () => fallback.removeAttribute('tabindex'), { once: true });
      fallback.focus();
    }
  }, [sections, fallbackRef]);

  return (deck: FlatDeck) => {
    const ids = sections.flatMap(({ decks }) => decks.map(({ id }) => id));
    const position = ids.indexOf(deck.id);
    pending.current = { deleted: deck.id, neighbour: ids[position + 1] ?? ids[position - 1] ?? null };
  };
}
