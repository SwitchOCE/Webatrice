import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

import type { ActionId } from '@app/feature-widgets/shortcuts';

/**
 * Seat-scoped shortcut operations, registered once per game by
 * useGameShortcuts.
 *
 * Most of these act on the local seat's selection, prompts or zones, which the
 * seat (useSeatShortcutOperations) owns. The local seat publishes the operations here;
 * useGameShortcuts owns every key binding and calls through. Only one seat
 * publishes (the local player's), so a keystroke can never reach two seats,
 * and a spectator without a seat leaves the browser default alone.
 */
export const SEAT_SHORTCUT_ACTIONS = [
  'game.mulligan',
  'game.setLife',
  'game.removeLocalArrows',
  'game.doesntUntap',
  'game.moveTopUntil',
  'game.alwaysRevealTopCard',
  'game.alwaysLookAtTopCard',
  'game.viewTopCards',
  'game.viewBottomCards',
  'game.createToken',
  'game.createAnotherToken',
  'game.drawArrow',
  'game.resetPT',
  'game.reduceLifeByPower',
  'game.addStormCounter',
  'game.removeStormCounter',
  'game.setStormCounter',
  'game.attachCard',
  'game.peekCard',
  'game.flipCard',
  'game.unattachCard',
  'game.moveSelectedToGrave',
  'game.setCardPT',
  'game.incP',
  'game.decP',
  'game.incT',
  'game.decT',
  'game.incPT',
  'game.decPT',
  'game.selectAllBattlefield',
  'game.selectRowBattlefield',
  'game.selectColumnBattlefield',
  'game.addCounterA',
  'game.removeCounterA',
  'game.setCounterA',
  'game.addCounterB',
  'game.removeCounterB',
  'game.setCounterB',
  'game.addCounterC',
  'game.removeCounterC',
  'game.setCounterC',
  'game.incrementAllCardCounters',
  'game.setAnnotation',
  'game.moveSelectedToLibraryBottom',
  'game.cloneCard',
  'game.revealSelectedToAll',
  'game.tapCard',
  'game.playCard',
  'game.playCardFaceDown',
  'game.createRelatedTokens',
  'game.moveSelectedToExile',
  'game.moveSelectedToHand',
  'game.moveSelectedToLibraryTop',
  'game.moveSelectedToBattlefield',
  'game.viewHand',
  'game.viewExile',
  'game.sortHandByName',
  'game.sortHandByManaValue',
  'game.revealHandToAll',
  'game.revealRandomHandCardToAll',
  'game.moveTopToPlayFaceDown',
  'game.moveTopNToGraveFaceDown',
  'game.moveTopToExile',
  'game.moveTopNToExile',
  'game.moveTopNToExileFaceDown',
  'game.moveTopToBottom',
  'game.moveBottomToPlay',
  'game.moveBottomToPlayFaceDown',
  'game.moveBottomToGrave',
  'game.moveBottomNToGrave',
  'game.moveBottomNToGraveFaceDown',
  'game.moveBottomToExile',
  'game.moveBottomNToExile',
  'game.moveBottomNToExileFaceDown',
  'game.moveBottomToTop',
  'game.drawBottomCard',
  'game.drawBottomCards',
  'game.shuffleTopCards',
  'game.shuffleBottomCards',
  'game.addCounterD',
  'game.removeCounterD',
  'game.setCounterD',
  'game.addCounterE',
  'game.removeCounterE',
  'game.setCounterE',
  'game.addCounterF',
  'game.removeCounterF',
  'game.setCounterF',
  'game.incLife',
  'game.decLife',
  'game.incManaCounterW',
  'game.decManaCounterW',
  'game.setManaCounterW',
  'game.incManaCounterU',
  'game.decManaCounterU',
  'game.setManaCounterU',
  'game.incManaCounterB',
  'game.decManaCounterB',
  'game.setManaCounterB',
  'game.incManaCounterR',
  'game.decManaCounterR',
  'game.setManaCounterR',
  'game.incManaCounterG',
  'game.decManaCounterG',
  'game.setManaCounterG',
  'game.incManaCounterX',
  'game.decManaCounterX',
  'game.setManaCounterX',
  'game.flowP',
  'game.flowT',
] as const satisfies readonly ActionId[];

export type SeatShortcutActionId = (typeof SEAT_SHORTCUT_ACTIONS)[number];

export type SeatShortcutOperations = Partial<Record<SeatShortcutActionId, () => void>>;

export interface SeatShortcutRegistry {
  /** Makes `getOperations` the seat that handles seat shortcuts until the
   *  returned function is called. A later publisher replaces an earlier one. */
  publish: (getOperations: () => SeatShortcutOperations) => () => void;
  /** Runs the published operation; false when no seat handles `actionId`. */
  run: (actionId: SeatShortcutActionId) => boolean;
}

export function createSeatShortcutRegistry(): SeatShortcutRegistry {
  let current: (() => SeatShortcutOperations) | null = null;
  return {
    publish: (getOperations) => {
      current = getOperations;
      return () => {
        if (current === getOperations) {
          current = null;
        }
      };
    },
    run: (actionId) => {
      const operation = current?.()[actionId];
      if (!operation) {
        return false;
      }
      operation();
      return true;
    },
  };
}

const SeatShortcutsContext = createContext<SeatShortcutRegistry | null>(null);

export function SeatShortcutsProvider({ registry, children }: { registry: SeatShortcutRegistry; children: ReactNode }) {
  return <SeatShortcutsContext.Provider value={registry}>{children}</SeatShortcutsContext.Provider>;
}

/**
 * Publish this seat's shortcut operations while `operations` is non-null. The
 * latest render's operations run, so they always see current seat state.
 */
export function usePublishSeatShortcuts(operations: SeatShortcutOperations | null): void {
  const registry = useContext(SeatShortcutsContext);
  const operationsRef = useRef(operations);
  operationsRef.current = operations;
  const publishing = operations != null;

  useEffect(() => {
    if (!registry || !publishing) {
      return;
    }
    return registry.publish(() => operationsRef.current ?? {});
  }, [registry, publishing]);
}
