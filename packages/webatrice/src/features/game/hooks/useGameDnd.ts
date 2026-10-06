import { ZoneName, moveTargetPlayerId } from '@cockatrice/sockatrice';
import { useCallback, useEffect, useState } from 'react';
import { pointerWithin, rectIntersection } from '@dnd-kit/core';
import type {
  Collision,
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  DroppableContainer,
} from '@dnd-kit/core';

import { useWebClient } from '@cockatrice/datatrice/react';
import type { BulkMoveDestination, WebClient } from '@cockatrice/sockatrice';
import { ServerInfo_Card, type MoveCardParams } from '@cockatrice/sockatrice/generated';
import { effectiveTargets, type SelectedCard } from '../utils/selection';
import {
  MARGIN_LEFT_PX,
  PADDING_X_PX,
  closestGridPoint,
  effectiveCardDimensions,
  mapToGridX,
  stackCountsForRow,
} from '../components/battlefield/Battlefield/gridMath';
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
  collapseUnlessSelected: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
  // Call-time getter for the live multi-selection, so a drop moves the whole
  // selection (when the dragged card is part of it) and not just the dragged card.
  getSelectedCards: () => readonly SelectedCard[];
  // A seat drop ends the selection that rode it, like PlayerBox always did.
  clearSelection?: () => void;
  // Sends one optimistic Command_MoveCard (useMoveCard); seat drops go through it.
  moveCard?: (params: MoveCardParams) => void;
}

// Reorder slots (small per-card droppables) are nested inside a much larger
// zone-level droppable. Default rectIntersection's IoU ratio favors the zone
// when the overlay outsizes a slot (e.g. 64x88 stack slots under a 146x204
// overlay), so the slot never wins. Prefer reorder-slot collisions whenever
// they exist; otherwise fall back to the full intersection set.
function slotIntersection(
  args: Parameters<CollisionDetection>[0],
  intersections: Collision[],
): Collision[] {
  return intersections.filter((c) =>
    args.droppableContainers.find((d) => d.id === c.id)?.data.current?.asReorderSlot === true,
  );
}

// A structured droppable lives "in a popup" when its node is inside a floating
// `.zone-view-dialog` element. (ZoneViewDialog's views are seat drop zones,
// ordered by SEAT_DROP_PRIORITY instead; no structured popup is mounted today.)
// Such a popup is visually stacked above the board, but dnd-kit collision is purely
// geometric: board droppables rendered underneath a popup would otherwise
// compete with — and beat — the popup's own droppables (its body + the reorder
// slots of the cards it renders).
function isInPopup(container: DroppableContainer | undefined): boolean {
  return !!container?.node.current?.closest('.zone-view-dialog');
}

// Scope collisions to the layer the pointer is actually over so drops respect a
// popup's z-order. If the pointer is within an open popup, only that popup's
// droppables are eligible (a board card dropped onto the popup routes into the
// popup's zone); otherwise popup droppables are excluded and the board/hand/
// stack droppables win (a card dropped on visible board lands there even if a
// popup overlaps elsewhere on screen).
//
// Limitation: with multiple overlapping popups open at once the scoped set spans
// every popup under the pointer rather than only the topmost. Acceptable today —
// the flows close each popup before opening the next.
function scopeToPointerLayer(
  args: Parameters<CollisionDetection>[0],
): Parameters<CollisionDetection>[0] {
  const overPopup = pointerWithin(args).some((c) =>
    isInPopup(args.droppableContainers.find((d) => d.id === c.id)),
  );
  const droppableContainers = args.droppableContainers.filter((c) => isInPopup(c) === overPopup);
  return { ...args, droppableContainers };
}

// Seat zones are hit-tested in paint order so the visible panel owns the drop.
// Priority is only a fallback in environments without DOM hit testing.
// Seat and structured droppables never compete for each other's drags.
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

const collisionDetection: CollisionDetection = (args) => {
  const source = args.active.data?.current;
  if (isSeatDragSource(source)) {
    return seatCollision(args, source);
  }
  const structured = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => !isSeatDropZone(c.data?.current)),
  };
  const scoped = scopeToPointerLayer(structured);
  const intersections = rectIntersection(scoped);
  const slotHits = slotIntersection(scoped, intersections);
  return slotHits.length > 0 ? slotHits : intersections;
};

interface DragSource {
  card: ServerInfo_Card;
  sourcePlayerId: number;
  sourceZone: string;
  sourceIndex?: number;
}

interface DragTarget {
  targetPlayerId: number;
  targetZone: string;
  row?: number;
  rowCards?: ServerInfo_Card[];
  targetIndex?: number;
  asReorderSlot?: boolean;
}

type DropContext =
  | { kind: 'reorder'; source: DragSource; target: DragTarget; targetIndex: number }
  | { kind: 'table'; source: DragSource; target: DragTarget; targetRow: number; sameRow: boolean }
  | { kind: 'cross-zone'; source: DragSource; target: DragTarget }
  | { kind: 'noop' };

function classifyDrop(event: DragEndEvent): DropContext {
  if (!event.over || !event.active.data.current) {
    return { kind: 'noop' };
  }
  const source = event.active.data.current as DragSource;
  const target = event.over.data.current as DragTarget;

  const sameZone =
    source.sourcePlayerId === target.targetPlayerId &&
    source.sourceZone === target.targetZone;

  // Any same-zone drop onto a per-card reorder slot is a reorder (hand, stack,
  // and zone-view popups like library/grave/exile). Table cards aren't reorder
  // slots, so table reorders fall through to the grid path below.
  if (sameZone && target.asReorderSlot && target.targetIndex != null) {
    if (source.sourceIndex === target.targetIndex) {
      return { kind: 'noop' };
    }
    return { kind: 'reorder', source, target, targetIndex: target.targetIndex };
  }

  if (target.targetZone === ZoneName.TABLE) {
    const targetRow = target.row ?? 0;
    const sameRow =
      sameZone &&
      source.sourceZone === ZoneName.TABLE &&
      (source.card.y ?? 0) === targetRow;
    return { kind: 'table', source, target, targetRow, sameRow };
  }

  if (sameZone) {
    // Same-zone drops that didn't hit a reorder slot are no-ops; the TABLE case
    // above already routed table reorders.
    return { kind: 'noop' };
  }

  // Cross-zone here is always a non-table destination (TABLE handled above), so
  // the move routes to the card's owner tree (see moveTargetPlayerId).
  return {
    kind: 'cross-zone',
    source,
    target: {
      ...target,
      targetPlayerId: moveTargetPlayerId(source.sourcePlayerId, target.targetZone, target.targetPlayerId),
    },
  };
}

// Drop point = card center at release (matches desktop scene position).
function computePointerXInRow(event: DragEndEvent): number {
  const overRect = event.over?.rect;
  const activeRect = event.active.rect.current.translated;
  if (!overRect || !activeRect) {
    return 0;
  }
  const cardCenterX = activeRect.left + activeRect.width / 2;
  return cardCenterX - overRect.left - MARGIN_LEFT_PX;
}

// Battlefield grid math; see .github/instructions/webatrice-game.instructions.md#battlefield-grid.
function resolveTableGridX(
  event: DragEndEvent,
  source: DragSource,
  target: DragTarget,
  sameRow: boolean,
): number | null {
  const rowCards = target.rowCards ?? [];
  // Same-row reorder: exclude the dragged card from occupancy so closestGridPoint can return its own slot.
  const neighbors = sameRow ? rowCards.filter((c) => c.id !== source.card.id) : rowCards;
  const pointerXInRow = computePointerXInRow(event);
  const stackCounts = stackCountsForRow(neighbors);
  // Effective card width derived from laneHeight so grid math tracks zoom (cards render via CSS aspect-ratio).
  const overRect = event.over?.rect;
  const { width: effectiveCardWidth, offsetX: effectiveOffsetX } =
    effectiveCardDimensions(overRect?.height ?? 0);
  const rawGridX = mapToGridX(
    pointerXInRow,
    stackCounts,
    effectiveCardWidth,
    effectiveOffsetX,
    PADDING_X_PX,
  );
  const occupied = new Set(neighbors.map((c) => c.x ?? 0));
  return closestGridPoint(rawGridX, occupied);
}

// Move the whole selection (the dragged card alone when it isn't part of a ≥2
// selection — byte-identical to the old single moveCard) to one destination.
// bulkMove groups by (owner, zone), routes each group via moveTargetPlayerId, and
// judge-wraps per owner — so all drop kinds share this one path.
function sendBulkMove(
  webClient: WebClient,
  gameId: number,
  source: DragSource,
  dest: BulkMoveDestination,
  selectedCards: readonly SelectedCard[],
  judgeTarget: (ownerPlayerId: number) => number | undefined,
): void {
  const targets = effectiveTargets(selectedCards, {
    ownerPlayerId: source.sourcePlayerId,
    zone: source.sourceZone,
    card: source.card,
  });
  webClient.request.game.bulkMove(gameId, targets, dest, judgeTarget);
}

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
  collapseUnlessSelected,
  getSelectedCards,
  clearSelection,
  moveCard,
}: UseGameDndArgs): GameDnd {
  const webClient = useWebClient();
  const [activeSeatDrag, setActiveSeatDrag] = useState<SeatDragSource | null>(null);
  useGrabbingCursor(activeSeatDrag !== null);

  // Cancel any pending arrow, then collapse the selection to the dragged card
  // unless it's already part of it (so a drag on a selected card keeps the set).
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      cancelPendingArrow();
      const data = event.active.data.current;
      if (isSeatDragSource(data)) {
        // A snapshot: the seat reuses its drag data object for the next press.
        setActiveSeatDrag({ ...data });
        return;
      }
      const source = data as DragSource | undefined;
      if (source?.card) {
        collapseUnlessSelected(source.sourcePlayerId, source.sourceZone, source.card);
      }
    },
    [cancelPendingArrow, collapseUnlessSelected],
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
        return;
      }
      if (!gameId) {
        return;
      }
      const ctx = classifyDrop(event);
      if (ctx.kind === 'noop') {
        return;
      }
      // Each kind keeps the destination it has always computed; the only change is
      // that the whole selection rides the move (effectiveTargets in sendBulkMove).
      const selectedCards = getSelectedCards();
      const move = (x: number, y: number): void =>
        sendBulkMove(
          webClient,
          gameId,
          ctx.source,
          { targetPlayerId: ctx.target.targetPlayerId, targetZone: ctx.target.targetZone, x, y },
          selectedCards,
          judgeTarget,
        );
      switch (ctx.kind) {
        case 'reorder':
          move(ctx.targetIndex, 0);
          return;
        case 'table': {
          const gridX = resolveTableGridX(event, ctx.source, ctx.target, ctx.sameRow);
          // Fully-occupied stack: silent reject.
          if (gridX == null) {
            return;
          }
          move(gridX, ctx.targetRow);
          return;
        }
        case 'cross-zone':
          move(0, 0);
          return;
      }
    },
    [gameId, webClient, judgeTarget, getSelectedCards, handleSeatDragEnd],
  );

  return { handleDragStart, handleDragEnd, handleDragCancel, collisionDetection, activeSeatDrag };
}
