import type { ZoneNameValue } from '@cockatrice/sockatrice';
import { RefObject, useCallback } from 'react';

import type { ColorRGBA } from '@app/types';
import type { ArrowTarget } from '../components/ui/PlayerBoard/playerBoard.types';
import { useTargetCommandsFor } from '../components/ui/GameBoardCell/usePlayerTargetCommands';
import { makeCardKey, type CardRegistry } from '../utils/CardRegistry/CardRegistryContext';
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
  startPendingArrow: (source: CardSource) => void;
  startPendingAttach: (source: CardSource) => void;
  cancelPendingOnDragStart: () => void;
}

export interface UseGameArrowInteractionsArgs {
  gameId: number | undefined;
  containerRef: RefObject<HTMLDivElement>;
  cardRegistry: CardRegistry;
}

const pendingSource = ({ sourcePlayerId, sourceZone, sourceCardId }: CardSource) =>
  ({ playerId: sourcePlayerId, zone: sourceZone as ZoneNameValue, cardId: sourceCardId, name: '' });

/**
 * The game-level card pointer interactions: the right-button arrow drag
 * (useArrowDrag) and the game's pending target pick (usePendingTarget).
 * Everything they send goes through the target port.
 */
export function useGameArrowInteractions({
  gameId,
  containerRef,
  cardRegistry,
}: UseGameArrowInteractionsArgs): GameArrowInteractions {
  const { localPlayerId } = useGameAccess(gameId);
  const targetCommandsFor = useTargetCommandsFor(gameId);
  const pendingTarget = usePendingTarget(gameId);
  const { pending } = pendingTarget;

  const onDrop = useCallback((source: ArrowSource, target: ArrowTarget, color: ColorRGBA) => {
    if (targetCommandsFor) {
      sendArrowPlan(planArrow(source, target, localPlayerId), targetCommandsFor, color);
    }
  }, [targetCommandsFor, localPlayerId]);
  const drag = useArrowDrag({ containerRef, cardRegistry, onDrop });

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
    startPendingArrow,
    startPendingAttach,
    cancelPendingOnDragStart: cancel,
  };
}
