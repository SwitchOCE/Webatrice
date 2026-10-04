import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { RefObject, useCallback } from 'react';

import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import type { ColorRGBA } from '@app/types';
import type { ArrowTarget } from '../components/ui/PlayerBoard/playerBoard.types';
import { useCardPlayCommands } from '../components/ui/GameBoardCell/useCardPlayCommands';
import { useTargetCommandsFor } from '../components/ui/GameBoardCell/usePlayerTargetCommands';
import { makeCardKey, type CardRegistry } from '../utils/CardRegistry/CardRegistryContext';
import { bulkTargetsFor, type SelectedCard } from '../utils/selection';
import { planArrow, sendArrowPlan, type ArrowSource } from './arrowResolution';
import { useArrowDrag, type ArrowDragPreview } from './useArrowDrag';
import { useGameAccess } from './useGameAccess';
import { usePendingTarget, type PendingTargetPicker } from './usePendingTarget';

export type { ArrowDragPreview };

interface CardSource {
  sourcePlayerId: number;
  sourceZone: string;
  sourceCardId: number;
}

export interface GameArrowInteractions {
  arrowSourceKey: string | null;
  arrowTargetKey: string | null;
  dragPreview: ArrowDragPreview | null;
  /** The game's pending target pick, which Game provides to the seats. */
  pendingTarget: PendingTargetPicker;
  // True while an arrow/attach is pending (used to gate box-select + clicks).
  pending: boolean;
  handleBoardMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleCardClick: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
  handleCardDoubleClick: (sourcePlayerId: number | undefined, sourceZone: string | undefined, card: ServerInfo_Card) => void;
  startPendingArrow: (source: CardSource) => void;
  startPendingAttach: (source: CardSource) => void;
  cancelPendingOnDragStart: () => void;
}

export interface UseGameArrowInteractionsArgs {
  gameId: number | undefined;
  containerRef: RefObject<HTMLDivElement>;
  cardRegistry: CardRegistry;
  // Resolved multi-selection + the collapse-unless-selected helper, so click and
  // double-click apply the collapse rule and bulk-tap a preserved selection.
  selectedCards: readonly SelectedCard[];
  collapseUnlessSelected: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
}

const pendingSource = ({ sourcePlayerId, sourceZone, sourceCardId }: CardSource) =>
  ({ playerId: sourcePlayerId, zone: sourceZone as ZoneNameValue, cardId: sourceCardId, name: '' });

/**
 * The game-level card pointer interactions: the right-button arrow drag
 * (useArrowDrag), the game's pending target pick (usePendingTarget), and the
 * card click / double-click handlers. Everything they send goes through the
 * target and card-play ports.
 */
export function useGameArrowInteractions({
  gameId,
  containerRef,
  cardRegistry,
  selectedCards,
  collapseUnlessSelected,
}: UseGameArrowInteractionsArgs): GameArrowInteractions {
  const { localPlayerId } = useGameAccess(gameId);
  const targetCommandsFor = useTargetCommandsFor(gameId);
  const cardPlay = useCardPlayCommands(gameId);
  const pendingTarget = usePendingTarget(gameId);
  const { pending } = pendingTarget;

  const onDrop = useCallback((source: ArrowSource, target: ArrowTarget, color: ColorRGBA) => {
    if (targetCommandsFor) {
      sendArrowPlan(planArrow(source, target, localPlayerId), targetCommandsFor, color);
    }
  }, [targetCommandsFor, localPlayerId]);
  const drag = useArrowDrag({ containerRef, cardRegistry, onDrop });

  const handleCardClick = useCallback(
    (ownerPlayerId: number | undefined, zone: string | undefined, card: ServerInfo_Card) => {
      if (gameId == null || ownerPlayerId == null || zone == null) {
        return;
      }
      // A pending pick takes the click; otherwise it is a selection click.
      if (!pendingTarget.pick({ kind: 'card', playerId: ownerPlayerId, zone: zone as ZoneNameValue, cardId: card.id })) {
        collapseUnlessSelected(ownerPlayerId, zone, card);
      }
    },
    [gameId, pendingTarget, collapseUnlessSelected],
  );

  const handleCardDoubleClick = useCallback(
    (sourcePlayerId: number | undefined, sourceZone: string | undefined, card: ServerInfo_Card) => {
      // A pending pick owns the pointer.
      if (!cardPlay || sourceZone == null || pending) {
        return;
      }
      // Double-click tap always goes through the collective tap (single = the
      // n=1 case). A card that's part of a multi-selection taps the TABLE subset
      // and keeps the selection; a lone card collapses the selection first, then
      // taps just itself.
      if (sourceZone === ZoneName.TABLE && sourcePlayerId != null) {
        const bulk = bulkTargetsFor(selectedCards, makeCardKey(sourcePlayerId, sourceZone, card.id));
        if (!bulk.length) {
          collapseUnlessSelected(sourcePlayerId, sourceZone, card);
        }
        cardPlay.tap(bulk.length
          ? bulk.filter((t) => t.zone === ZoneName.TABLE)
          : [{ ownerPlayerId: sourcePlayerId, zone: sourceZone, card }]);
        return;
      }
      collapseUnlessSelected(sourcePlayerId, sourceZone, card);
      if ((sourceZone === ZoneName.HAND || sourceZone === ZoneName.STACK) && sourcePlayerId != null) {
        cardPlay.autoPlay(sourcePlayerId, sourceZone, card);
      }
    },
    [cardPlay, pending, selectedCards, collapseUnlessSelected],
  );

  const { startArrow, startAttach, cancel } = pendingTarget;
  const startPendingArrow = useCallback((source: CardSource) => startArrow(pendingSource(source)), [startArrow]);
  const startPendingAttach = useCallback((source: CardSource) => startAttach(pendingSource(source)), [startAttach]);

  return {
    arrowSourceKey: pending
      ? makeCardKey(pending.source.playerId, pending.source.zone, pending.source.cardId)
      : drag.sourceKey,
    arrowTargetKey: drag.targetKey,
    dragPreview: drag.preview,
    pendingTarget,
    pending: pending != null,
    handleBoardMouseDown: drag.handleBoardMouseDown,
    handleCardClick,
    handleCardDoubleClick,
    startPendingArrow,
    startPendingAttach,
    cancelPendingOnDragStart: cancel,
  };
}
