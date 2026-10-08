import { useCallback, useEffect, useState } from 'react';
import { pointerWithin } from '@dnd-kit/core';
import type { Collision, CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';

import { useWebClient } from '@cockatrice/datatrice/react';
import { type MoveCardParams } from '@cockatrice/sockatrice/generated';
import {
  isSeatDragSource,
  isSeatDropZone,
  planSeatMove,
  seatDropAccepts,
  type SeatDragSource,
} from './seatDropPlan';
import { seatDropPointOf } from '../components/ui/SeatDragContext';

export interface GameDnd {
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
  collisionDetection: CollisionDetection;
  /** The seat drag in progress, from activation until the drop. */
  activeSeatDrag: SeatDragSource | null;
}

export interface UseGameDndArgs {
  gameId: number | undefined;
  // Resolves the Command_Judge target for a dragged card's owner (the owner when a
  // judge drags a foreign card, else undefined → bare). Passed in to keep this hook
  // store-decoupled. See useJudgeTarget.
  judgeTarget: (ownerPlayerId: number) => number | undefined;
  cancelPendingArrow: () => void;
  // A seat drop ends the selection that rode it, like PlayerBox always did.
  clearSelection?: () => void;
  // Sends one optimistic Command_MoveCard (useMoveCard); seat drops go through it.
  moveCard?: (params: MoveCardParams) => void;
}

// Seat zones are hit-tested in paint order so the visible panel owns the drop.
// Priority is only a fallback in environments without DOM hit testing.
function seatCollision(args: Parameters<CollisionDetection>[0], source: SeatDragSource): Collision[] {
  // Browser paint order includes floating panels' stacking contexts and DOM
  // order. Fixed zone priorities cannot distinguish overlapping zone views.
  const pointer = args.pointerCoordinates;
  const doc = args.droppableContainers.find((c) => c.node.current)?.node.current?.ownerDocument;
  if (pointer && doc?.elementsFromPoint) {
    const hits = pointerWithin(args);
    for (const element of doc.elementsFromPoint(pointer.x, pointer.y)) {
      const front = args.droppableContainers.find((container) =>
        isSeatDropZone(container.data.current) &&
        hits.some((hit) => hit.id === container.id) &&
        container.node.current?.contains(element),
      );
      if (front) {
        // A view which refuses this source must not drop through to a hidden
        // accepting view/board behind it.
        const zone = front.data.current;
        return isSeatDropZone(zone) && seatDropAccepts(zone, source)
          ? hits.filter((hit) => hit.id === front.id)
          : [];
      }
    }
    return [];
  }
  const accepting = args.droppableContainers.filter((container) => {
    const zone = container.data.current;
    return isSeatDropZone(zone) && seatDropAccepts(zone, source);
  });
  const priorityOf = (id: Collision['id']) => {
    const zone = accepting.find((c) => c.id === id)?.data.current;
    return isSeatDropZone(zone) ? zone.priority : 0;
  };
  return pointerWithin({ ...args, droppableContainers: accepting })
    .sort((a, b) => priorityOf(b.id) - priorityOf(a.id));
}

// Every card drag on the board is a seat drag (useSeatDragSource); a drag
// from anything else has nowhere to land.
const collisionDetection: CollisionDetection = (args) => {
  const source = args.active.data?.current;
  return isSeatDragSource(source) ? seatCollision(args, source) : [];
};

// While a seat drag is active the whole document shows the grabbing cursor, so
// the OS cursor doesn't pick up `not-allowed` from whatever is underneath.
function useGrabbingCursor(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { cursor: grabbing !important; }';
    document.head.appendChild(style);
    return () => {
      document.body.style.cursor = previous;
      style.remove();
    };
  }, [active]);
}

export function useGameDnd({
  gameId,
  judgeTarget,
  cancelPendingArrow,
  clearSelection,
  moveCard,
}: UseGameDndArgs): GameDnd {
  const webClient = useWebClient();
  const [activeSeatDrag, setActiveSeatDrag] = useState<SeatDragSource | null>(null);
  useGrabbingCursor(activeSeatDrag !== null);

  // A drag cancels any pending arrow.
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      cancelPendingArrow();
      const data = event.active.data.current;
      if (isSeatDragSource(data)) {
        // A snapshot: the seat reuses its drag data object for the next press.
        setActiveSeatDrag({ ...data });
      }
    },
    [cancelPendingArrow],
  );

  // A seat drop: the zone under the pointer says where in it the cards land,
  // planSeatMove turns that into the command set, and each command goes
  // through the optimistic move path.
  const handleSeatDragEnd = useCallback(
    (event: DragEndEvent, source: SeatDragSource) => {
      setActiveSeatDrag(null);
      const zone = event.over?.data.current;
      const target = isSeatDropZone(zone) ? zone.resolve(seatDropPointOf(event), source) : null;
      if (target && moveCard && gameId) {
        // A judge moving another player's cards acts as their owner (the
        // move's start player) through Command_Judge, like desktop's
        // PlayerActions::sendGameCommand, and waits for the server rather
        // than moving optimistically. A lent zone is moved by its borrower
        // under the lender's write permission.
        for (const params of planSeatMove(source, target)) {
          const judgeTargetId = source.lenderPlayerId == null ? judgeTarget(params.startPlayerId) : undefined;
          if (judgeTargetId != null) {
            webClient.request.game.moveCard(gameId, params, judgeTargetId);
          } else {
            moveCard(params);
          }
        }
      }
      clearSelection?.();
    },
    [gameId, webClient, moveCard, clearSelection, judgeTarget],
  );

  const handleDragCancel = useCallback(() => setActiveSeatDrag(null), []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const seatSource = event.active.data.current;
      if (isSeatDragSource(seatSource)) {
        handleSeatDragEnd(event, { ...seatSource });
      }
    },
    [handleSeatDragEnd],
  );

  return { handleDragStart, handleDragEnd, handleDragCancel, collisionDetection, activeSeatDrag };
}
