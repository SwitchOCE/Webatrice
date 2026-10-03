import { useCallback, useMemo, useState } from 'react';

import { ZoneName } from '@cockatrice/sockatrice';

import { useGameSelectionState } from '../components/ui/GameSelectionContext';
import { makeCardKey } from '../utils/CardRegistry/CardRegistryContext';
import { EMPTY_SELECTION } from '../utils/selection';

/** The seat zones a selection can live in. A seat selection is single-zone. */
export type SeatSelectionZone = 'hand' | 'battlefield' | 'stack';

export interface SeatSelection {
  zone: SeatSelectionZone;
  /** Card ids, as the seat's view models carry them. */
  ids: Set<string>;
}

/** The cards a seat shows per selectable zone. Battlefield cards may belong to
 *  another player (a cross-player attachment); the rest are the seat's own. */
export interface SeatSelectableCards {
  hand: readonly { id: string }[];
  battlefield: readonly { id: string; ownerPlayerId?: number }[];
  stack: readonly { id: string }[];
}

const SEAT_ZONES: readonly SeatSelectionZone[] = ['hand', 'battlefield', 'stack'];

const WIRE_ZONE: Record<SeatSelectionZone, string> = {
  hand: ZoneName.HAND,
  battlefield: ZoneName.TABLE,
  stack: ZoneName.STACK,
};

export interface SeatSelectionApi {
  /** This seat's share of the game selection, or null. */
  selection: SeatSelection | null;
  /** A non-null selection replaces the whole game selection, so any other
   *  seat's selection clears; null clears only this seat's cards. */
  setSelection: (next: SeatSelection | null) => void;
  /** Clears the selection on every seat. */
  clearAllSelection: () => void;
}

/**
 * One seat's view of the game-level selection (useGameSelection), in the
 * `{ zone, ids }` shape the seat's menus and bulk actions use.
 *
 * Keys carry each card's real owner, so game-level consumers (DnD, dialogs)
 * resolve them like any other selection. Outside a game (isolated renders) the
 * seat keeps a selection of its own.
 */
export function useSeatSelection(playerId: number, cards: SeatSelectableCards): SeatSelectionApi {
  const game = useGameSelectionState();
  const [localKeys, setLocalKeys] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const selectedCardKeys = game?.selectedCardKeys ?? localKeys;
  const setSelectedCardKeys = game?.setSelectedCardKeys ?? setLocalKeys;

  const keyOf = useCallback(
    (zone: SeatSelectionZone, card: { id: string; ownerPlayerId?: number }) =>
      makeCardKey(card.ownerPlayerId ?? playerId, WIRE_ZONE[zone], Number(card.id)),
    [playerId],
  );

  const selection = useMemo<SeatSelection | null>(() => {
    if (selectedCardKeys.size === 0) {
      return null;
    }
    for (const zone of SEAT_ZONES) {
      const ids = cards[zone].filter((card) => selectedCardKeys.has(keyOf(zone, card))).map((card) => card.id);
      if (ids.length > 0) {
        return { zone, ids: new Set(ids) };
      }
    }
    return null;
  }, [selectedCardKeys, cards, keyOf]);

  const setSelection = useCallback(
    (next: SeatSelection | null) => {
      if (next) {
        const zoneCards: readonly { id: string; ownerPlayerId?: number }[] = cards[next.zone];
        const byId = new Map(zoneCards.map((card) => [card.id, card] as const));
        const keys = new Set<string>();
        next.ids.forEach((id) => keys.add(keyOf(next.zone, byId.get(id) ?? { id })));
        setSelectedCardKeys(keys);
        return;
      }
      const own = new Set<string>();
      for (const zone of SEAT_ZONES) {
        cards[zone].forEach((card) => own.add(keyOf(zone, card)));
      }
      setSelectedCardKeys((prev) => {
        if (![...prev].some((key) => own.has(key))) {
          return prev;
        }
        const kept = new Set([...prev].filter((key) => !own.has(key)));
        return kept.size === 0 ? EMPTY_SELECTION : kept;
      });
    },
    [cards, keyOf, setSelectedCardKeys],
  );

  const clearAllSelection = useCallback(() => setSelectedCardKeys(EMPTY_SELECTION), [setSelectedCardKeys]);

  return { selection, setSelection, clearAllSelection };
}
