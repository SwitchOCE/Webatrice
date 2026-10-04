// What a battlefield card action applies to, and the per-card maths it sends:
// shared by the battlefield card menu and the seat's keyboard shortcuts
// (useBattlefieldCardOps binds these to the seat ports). Pure: no React, no
// requests.

import type { SeatSelection } from '../../../hooks/useSeatSelection';
import { applyPTDelta, parsePT } from '../../context-menus/CardContextMenu/cardAttributeEdits';
import { MAX_COUNTER_VALUE } from './counterLimits';
import type { BattlefieldCardViewModel, CardCloneSource } from './playerBoard.types';

/** The cards a battlefield action applies to, and the card whose state drives
 *  its toggles and prompt prefills. */
export interface BattlefieldTargets {
  cards: readonly BattlefieldCardViewModel[];
  anchor: BattlefieldCardViewModel;
}

/** The printed P/T of a card by name, or '' when unknown. */
export type PrintedPT = (cardName: string) => string;

/**
 * Desktop's cardMenuAction rule (player_actions.cpp:1761-1808). From a card
 * menu (`anchorId` given): the whole battlefield selection when the clicked
 * card is part of it, otherwise that card alone. From a shortcut (no anchor):
 * the battlefield selection, anchored on its first card. Cards come back in
 * display order; null when there is nothing to act on.
 */
export function resolveTargets(
  cards: readonly BattlefieldCardViewModel[],
  selection: SeatSelection | null,
  anchorId?: string,
): BattlefieldTargets | null {
  const battlefieldSelection = selection?.zone === 'battlefield' ? selection.ids : null;
  if (anchorId != null) {
    const anchor = cards.find((c) => c.id === anchorId);
    if (!anchor) {
      return null;
    }
    return battlefieldSelection?.has(anchor.id)
      ? { cards: cards.filter((c) => battlefieldSelection.has(c.id)), anchor }
      : { cards: [anchor], anchor };
  }
  if (!battlefieldSelection) {
    return null;
  }
  const selected = cards.filter((c) => battlefieldSelection.has(c.id));
  return selected.length > 0 ? { cards: selected, anchor: selected[0] } : null;
}

/** The battlefield selection when there is one, else the whole battlefield
 *  (desktop actIncrementAllCardCounters). */
export function selectionOrAll(
  cards: readonly BattlefieldCardViewModel[],
  selection: SeatSelection | null,
): readonly BattlefieldCardViewModel[] {
  return selection?.zone === 'battlefield' && selection.ids.size > 0
    ? cards.filter((c) => selection.ids.has(c.id))
    : cards;
}

/** Server ids of the cards; optimistic placeholders without one drop out. */
export function cardIdsOf(cards: readonly BattlefieldCardViewModel[]): number[] {
  return cards.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
}

/** The P/T a card shows: the server's, else its printed one. */
export function currentPT(card: BattlefieldCardViewModel, printedPT: PrintedPT): string {
  return card.pt || printedPT(card.name);
}

/**
 * Desktop actIncPT over the cards: each card moves from its OWN current P/T,
 * so a mixed selection keeps its differences. A card with no P/T starts from
 * `0/0`, so `+1/+0` gives `1/0` rather than dropping the toughness.
 */
export function ptDeltaEntries(
  cards: readonly BattlefieldCardViewModel[],
  printedPT: PrintedPT,
  deltaP: number,
  deltaT: number,
): { cardId: number; pt: string }[] {
  return withIds(cards).map(([cardId, card]) => ({
    cardId,
    pt: applyPTDelta(currentPT(card, printedPT) || '0/0', deltaP, deltaT),
  }));
}

/**
 * Desktop actResetPT: a face-down card resets to no P/T, a face-up one to its
 * printed P/T. Cards already there are skipped.
 */
export function resetPTEntries(
  cards: readonly BattlefieldCardViewModel[],
  printedPT: PrintedPT,
): { cardId: number; pt: string }[] {
  return withIds(cards).flatMap(([cardId, card]) => {
    const pt = card.faceDown ? '' : printedPT(card.name);
    return pt === (card.pt ?? '') ? [] : [{ cardId, pt }];
  });
}

/** One step of counter `counterId` on each card, from each card's own value,
 *  skipping cards already at the [0, MAX_COUNTER_VALUE] bound. */
export function counterStepEntries(
  cards: readonly BattlefieldCardViewModel[],
  counterId: number,
  step: 1 | -1,
): { cardId: number; counterId: number; value: number }[] {
  return withIds(cards).flatMap(([cardId, card]) => {
    const value = counterValue(card, counterId) + step;
    return value < 0 || value > MAX_COUNTER_VALUE ? [] : [{ cardId, counterId, value }];
  });
}

/** Desktop actIncrementAllCardCounters: +1 on every counter the cards already
 *  carry, skipping counters at MAX_COUNTER_VALUE. */
export function incrementAllCounterEntries(
  cards: readonly BattlefieldCardViewModel[],
): { cardId: number; counterId: number; value: number }[] {
  return withIds(cards).flatMap(([cardId, card]) =>
    (card.counters ?? [])
      .filter((counter) => counter.value < MAX_COUNTER_VALUE)
      .map((counter) => ({ cardId, counterId: counter.id, value: counter.value + 1 })),
  );
}

export function counterValue(card: BattlefieldCardViewModel, counterId: number): number {
  return card.counters?.find((counter) => counter.id === counterId)?.value ?? 0;
}

/**
 * Desktop actReduceLifeByPower (player_actions.cpp:1432-1455): the summed
 * power of the cards, from the server's P/T only (no printed fallback), with
 * a negative power counting as 0.
 */
export function totalPower(cards: readonly BattlefieldCardViewModel[]): number {
  let total = 0;
  for (const card of cards) {
    const first = parsePT(card.pt ?? '')[0];
    if (first == null) {
      continue;
    }
    const power = typeof first === 'number' ? first : parseInt(first, 10);
    if (Number.isFinite(power)) {
      total += Math.max(power, 0);
    }
  }
  return total;
}

/** Desktop cmClone: a token copying the card, on the card's own row. */
export function cloneSource(card: BattlefieldCardViewModel): CardCloneSource {
  return {
    name: card.name,
    providerId: card.scryfallId,
    color: card.color ?? '',
    pt: card.pt ?? '',
    annotation: card.annotation ?? '',
    y: card.slot.row,
  };
}

/** Ids of every card sharing the anchor's battlefield row or column. */
export function sameSlotIds(
  cards: readonly BattlefieldCardViewModel[],
  anchor: BattlefieldCardViewModel,
  field: 'row' | 'col',
): Set<string> {
  return new Set(cards.filter((c) => c.slot[field] === anchor.slot[field]).map((c) => c.id));
}

function withIds(cards: readonly BattlefieldCardViewModel[]): [number, BattlefieldCardViewModel][] {
  return cards.flatMap((card) => {
    const id = Number(card.id);
    return Number.isFinite(id) ? [[id, card]] : [];
  });
}
