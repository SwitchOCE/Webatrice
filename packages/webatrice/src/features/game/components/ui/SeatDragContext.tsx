import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useDndContext, useDndMonitor, useDraggable, useDroppable, type DragMoveEvent } from '@dnd-kit/core';

import type { Coordinates } from '../../hooks/gamePointerSensor';
import {
  isSeatDragSource,
  isSeatDropZone,
  type SeatDragCard,
  type SeatDragSource,
  type SeatDropPoint,
  type SeatDropTarget,
  type SeatDropZone,
  type SeatZone,
} from '../../hooks/seatDropPlan';

/**
 * The seat side of the game's DnD (useGameDnd): drag sources, drop zones and
 * the drag ghost for the seat (PlayerBoard) surfaces.
 */

/** Pixels the pointer must leave the press point by, along either axis, before
 *  a seat press becomes a drag; a release inside is a click. */
export const SEAT_DRAG_THRESHOLD_PX = 4;

const ActiveSeatDragContext = createContext<SeatDragSource | null>(null);

/** Provided by Game from useGameDnd. */
export const ActiveSeatDragProvider = ActiveSeatDragContext.Provider;

/** The seat drag in progress (after the threshold), or null. */
export function useActiveSeatDrag(): SeatDragSource | null {
  return useContext(ActiveSeatDragContext);
}

export interface SeatDragSourceOptions {
  seatPlayerId: number;
  zone: SeatZone;
  /** Owner of a lent zone; see SeatDragSource. */
  lenderPlayerId?: number;
  /** Whether the local user may move a card of this owner: their own, or any
   *  as a judge (desktop CardItem::mouseMoveEvent, getLocalOrJudge). A press
   *  on a card they may not move still clicks (selection) but never becomes a
   *  drag. Each card's owner is its `ownerPlayerId`, else the seat's player.
   *  Without it every card drags. */
  canMoveFor?: (ownerPlayerId: number) => boolean;
  disabled?: boolean;
}

/** Starts a seat drag from a pointerdown: the cards to drag (in display order)
 *  and what a click (a release before the threshold) does. */
export type SeatDragStart = (
  event: ReactPointerEvent<HTMLElement>,
  cards: readonly SeatDragCard[],
  onRelease?: (event: PointerEvent) => void,
) => void;

/**
 * One seat surface cards are dragged from (a zone, or a dialog over it). The
 * surface calls the returned `start` from its cards' pointerdown; the pressed
 * element becomes the drag's anchor, so the ghost stays where it was grabbed.
 */
export function useSeatDragSource(id: string, options: SeatDragSourceOptions): SeatDragStart {
  // One data object per surface, refreshed at each press: dnd-kit reads the
  // data through a ref, and useGameDnd snapshots it when the drag starts.
  const data = useRef<SeatDragSource>({
    kind: 'seat',
    seatPlayerId: options.seatPlayerId,
    zone: options.zone,
    cards: [],
    activationDistance: SEAT_DRAG_THRESHOLD_PX,
  }).current;
  const { setNodeRef, listeners } = useDraggable({ id, data, disabled: options.disabled });
  const { seatPlayerId, zone, lenderPlayerId, canMoveFor } = options;

  return useCallback<SeatDragStart>(
    (event, cards, onRelease) => {
      if (event.button !== 0 || cards.length === 0 || !listeners) {
        return;
      }
      const canDrag = !canMoveFor || cards.every((card) => canMoveFor(card.ownerPlayerId ?? seatPlayerId));
      Object.assign(data, {
        seatPlayerId,
        zone,
        lenderPlayerId,
        cards,
        onRelease,
        activationDistance: canDrag ? SEAT_DRAG_THRESHOLD_PX : Number.POSITIVE_INFINITY,
      });
      setNodeRef(event.currentTarget);
      listeners.onPointerDown(event);
      // After dnd-kit has seen the press (it ignores prevented events): no
      // text selection and no native HTML5 drag of the card art.
      event.preventDefault();
    },
    [data, listeners, setNodeRef, seatPlayerId, zone, lenderPlayerId, canMoveFor],
  );
}

/**
 * One seat zone cards can be dropped on. Returns the ref for the zone's
 * element; the zone's `resolve` says where in it a drop lands.
 */
export function useSeatDropZone(
  id: string,
  zone: Omit<SeatDropZone, 'kind'>,
  disabled = false,
): (element: HTMLElement | null) => void {
  const { setNodeRef } = useDroppable({ id, data: { kind: 'seat-drop', ...zone }, disabled });
  return setNodeRef;
}

/**
 * Draws the drag ghost for a seat drag: `children` gets the dragged card's
 * top-left as it follows the pointer. Only this component re-renders while
 * the pointer moves.
 */
export function SeatDragGhost({ children }: { children: (origin: Coordinates) => ReactNode }) {
  const { active } = useDndContext();
  const [delta, setDelta] = useState<Coordinates>({ x: 0, y: 0 });
  useDndMonitor({
    onDragMove: (event) => setDelta(event.delta),
    onDragEnd: () => setDelta({ x: 0, y: 0 }),
    onDragCancel: () => setDelta({ x: 0, y: 0 }),
  });
  const initial = active?.rect.current.initial;
  if (!initial) {
    return null;
  }
  return <>{children({ x: initial.left + delta.x, y: initial.top + delta.y })}</>;
}

/** The pointer and the dragged card's top-left during or at the end of a
 *  drag: where the drag was grabbed plus how far it has travelled. */
export function seatDropPointOf(event: Pick<DragMoveEvent, 'activatorEvent' | 'active' | 'delta'>): SeatDropPoint {
  const activator = event.activatorEvent as PointerEvent | null;
  const start = { x: activator?.clientX ?? 0, y: activator?.clientY ?? 0 };
  const origin = event.active.rect.current.initial ?? { left: start.x, top: start.y };
  return {
    pointer: { x: start.x + event.delta.x, y: start.y + event.delta.y },
    cardOrigin: { x: origin.left + event.delta.x, y: origin.top + event.delta.y },
  };
}

/**
 * Where a seat drag would land on the drop zone `dropId` right now, for a
 * drop preview: the same resolution the drop itself uses. `children` gets
 * null while the drag is elsewhere or there is none. Only this component
 * re-renders while the pointer moves.
 */
export function SeatDropPreview({
  dropId,
  children,
}: {
  dropId: string;
  children: (target: SeatDropTarget | null) => ReactNode;
}) {
  const [target, setTarget] = useState<SeatDropTarget | null>(null);
  // Moves update the slot; entering or leaving the zone (which can follow
  // the move that caused it) updates it too.
  const follow = (event: DragMoveEvent) => {
    const zone = event.over?.data.current;
    const source = event.active.data.current;
    setTarget(
      event.over?.id === dropId && isSeatDropZone(zone) && isSeatDragSource(source)
        ? zone.resolve(seatDropPointOf(event), source)
        : null,
    );
  };
  useDndMonitor({
    onDragMove: follow,
    onDragOver: follow,
    onDragEnd: () => setTarget(null),
    onDragCancel: () => setTarget(null),
  });
  return <>{children(target)}</>;
}
