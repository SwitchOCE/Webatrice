// What an arrow or attach pick does once it reaches a target: desktop's
// ArrowDragItem / ArrowAttachItem release (arrow_item.cpp:392-571). Pure: the
// plan names the commands, and sendArrowPlan sends it through the target port.
// Both the right-button drag (useArrowDrag) and the menu / shortcut picks
// (usePendingTarget) resolve here.

import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { ArrowColor, type ColorRGBA } from '@app/types';

import type { ArrowTarget, PlayerTargetCommands } from '../components/ui/PlayerBoard/playerBoard.types';

/** The card an arrow or attach starts from. */
export interface ArrowSource {
  playerId: number;
  zone: ZoneNameValue;
  cardId: number;
}

export type ArrowPlan =
  | { kind: 'none' }
  | { kind: 'arrow'; source: ArrowSource; target: ArrowTarget }
  /** A local hand card is played first; the arrow then starts where it lands. */
  | { kind: 'playThenArrow'; source: ArrowSource; target: ArrowTarget }
  | { kind: 'attach'; sourcePlayerId: number; sourceCardIds: readonly number[]; target: { playerId: number; cardId: number } };

const isSameCard = (source: ArrowSource, target: ArrowTarget) =>
  target.kind === 'card'
  && target.playerId === source.playerId
  && target.zone === source.zone
  && target.cardId === source.cardId;

/**
 * An arrow onto its own source card is a cancel. An arrow from the local
 * player's hand to anything outside the hand plays the card as it is drawn.
 */
export function planArrow(source: ArrowSource, target: ArrowTarget, localPlayerId: number | undefined): ArrowPlan {
  if (isSameCard(source, target)) {
    return { kind: 'none' };
  }
  const fromLocalHand = source.zone === ZoneName.HAND && source.playerId === localPlayerId;
  const toHand = target.kind === 'card' && target.zone === ZoneName.HAND;
  return { kind: fromLocalHand && !toHand ? 'playThenArrow' : 'arrow', source, target };
}

/**
 * Attach every source card (battlefield cards of one player) to a target
 * card on the battlefield. A click on one of the sources, on a card in any
 * other zone, or on a player cancels (desktop ArrowAttachItem::attachCards,
 * arrow_item.cpp:553-556, refuses a target that is not on the table).
 */
export function planAttach(sourcePlayerId: number, sourceCardIds: readonly number[], target: ArrowTarget): ArrowPlan {
  if (
    target.kind !== 'card'
    || target.zone !== ZoneName.TABLE
    || (target.playerId === sourcePlayerId && sourceCardIds.includes(target.cardId))
  ) {
    return { kind: 'none' };
  }
  return { kind: 'attach', sourcePlayerId, sourceCardIds, target: { playerId: target.playerId, cardId: target.cardId } };
}

/** Desktop's arrow colours by modifier (CardItem::mouseMoveEvent): Ctrl yellow,
 *  Alt blue, Shift green, otherwise red. */
export function arrowColorForModifiers(modifiers: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): ColorRGBA {
  if (modifiers.ctrlKey) {
    return ArrowColor.YELLOW;
  }
  if (modifiers.altKey) {
    return ArrowColor.BLUE;
  }
  if (modifiers.shiftKey) {
    return ArrowColor.GREEN;
  }
  return ArrowColor.RED;
}

/** Send a plan through the source owner's target commands. */
export function sendArrowPlan(
  plan: ArrowPlan,
  commandsFor: (playerId: number) => PlayerTargetCommands,
  color: ColorRGBA = ArrowColor.RED,
): void {
  switch (plan.kind) {
    case 'arrow':
      commandsFor(plan.source.playerId).createArrow(plan.source.cardId, plan.source.zone, plan.target, color);
      return;
    case 'playThenArrow':
      commandsFor(plan.source.playerId).playAndCreateArrow(plan.source.cardId, plan.target, color);
      return;
    case 'attach': {
      // Command_AttachCard has no batch form: one per source card.
      const commands = commandsFor(plan.sourcePlayerId);
      for (const cardId of plan.sourceCardIds) {
        commands.attach(cardId, plan.target);
      }
      return;
    }
    case 'none':
      return;
  }
}
