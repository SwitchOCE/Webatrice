import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoneName } from '@cockatrice/sockatrice';

import type { PlayerZoneCommands } from '../components/ui/PlayerBoard/playerBoard.types';
import { isFilterEmpty, matchCard, parseCardFilter, type CardFilter, type FilterableCard } from '../utils/cardFilter';

/** What the "Put top cards on stack until…" dialog submits. */
export interface MoveTopUntilRequest {
  /** Card name or search expression (cardFilter syntax). */
  filter: string;
  /** Matches to find before stopping. */
  hits: number;
  /** Play each match from the stack to the battlefield. */
  autoPlay: boolean;
}

export interface UseMoveTopUntilOptions {
  /** Only the local player's own seat runs the loop. */
  enabled: boolean;
  /** The seat's stack, as it renders it (bottom → top). */
  stackCards: readonly { id: string; name: string }[];
  deckCount: number;
  /** The searchable fields of a revealed card. */
  describeCard: (name: string) => FilterableCard;
  moveCards: PlayerZoneCommands['moveCards'] | undefined;
}

interface LoopState {
  filter: CardFilter;
  remainingHits: number;
  autoPlay: boolean;
}

/**
 * "Put top cards on stack until…": reveals the library's top card onto the
 * stack, one at a time, until enough cards match. Ports desktop's
 * PlayerActions::moveOneCardUntil (player_actions.cpp:504-528).
 *
 * The loop is driven by the projected stack, not by timers: each reveal is
 * a Command_MoveCard (deck top → stack), and the next one is sent only when
 * the server's Event_MoveCard lands that card on the stack. The stack ids
 * present when the loop starts, and any card it has already judged, are
 * remembered, so a state update without a new stack card sends nothing and
 * a card someone else put on the stack meanwhile is recorded but not judged
 * twice. It stops on the last hit or an empty library.
 *
 * Returns `start`, for the dialog's submit.
 */
export function useMoveTopUntil({
  enabled,
  stackCards,
  deckCount,
  describeCard,
  moveCards,
}: UseMoveTopUntilOptions): (request: MoveTopUntilRequest) => void {
  const [loop, setLoop] = useState<LoopState | null>(null);
  const seenStackIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !loop) {
      return;
    }
    const newIds: string[] = [];
    for (const c of stackCards) {
      if (!seenStackIdsRef.current.has(c.id)) {
        newIds.push(c.id);
      }
    }
    // Record every new card, even one an unrelated move put there, so the
    // next reveal is the only new card when it arrives.
    for (const id of newIds) {
      seenStackIdsRef.current.add(id);
    }
    if (newIds.length === 0) {
      return;
    }
    // One reveal is in flight at a time; if several cards appeared, the
    // top-most is the reveal.
    const revealedId = newIds[newIds.length - 1];
    const revealed = stackCards.find((c) => c.id === revealedId);
    if (!revealed) {
      return;
    }
    const isMatch = matchCard(loop.filter, describeCard(revealed.name));
    let remaining = loop.remainingHits;
    if (isMatch) {
      remaining -= 1;
      const revealedIdNum = Number(revealed.id);
      if (loop.autoPlay && moveCards && Number.isFinite(revealedIdNum)) {
        moveCards(ZoneName.STACK, [revealedIdNum], { zone: ZoneName.TABLE, index: 'end' });
      }
    }
    if (remaining <= 0 || deckCount <= 0 || !moveCards) {
      setLoop(null);
      return;
    }
    moveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
    if (isMatch) {
      setLoop({ ...loop, remainingHits: remaining });
    }
  }, [enabled, loop, stackCards, deckCount, describeCard, moveCards]);

  return useCallback(
    ({ filter, hits, autoPlay }: MoveTopUntilRequest) => {
      if (!enabled || !moveCards || deckCount <= 0) {
        return;
      }
      const parsed = parseCardFilter(filter);
      // An empty filter would match every reveal and dump the whole
      // library onto the stack.
      if (isFilterEmpty(parsed)) {
        return;
      }
      seenStackIdsRef.current = new Set(stackCards.map((c) => c.id));
      setLoop({ filter: parsed, remainingHits: hits, autoPlay });
      moveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
    },
    [enabled, moveCards, deckCount, stackCards],
  );
}
