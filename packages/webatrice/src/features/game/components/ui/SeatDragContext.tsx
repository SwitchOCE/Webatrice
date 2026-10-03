import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useDndContext, useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';

import type { Coordinates } from '../../hooks/gamePointerSensor';
import type { SeatDragCard, SeatDragSource, SeatDropZone, SeatZone } from '../../hooks/seatDropPlan';

/**
 * The seat side of the game's DnD (useGameDnd): drag sources, drop zones and
 * the drag ghost for the PlayerBox seat surfaces.
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
  const { seatPlayerId, zone, lenderPlayerId } = options;

  return useCallback<SeatDragStart>(
    (event, cards, onRelease) => {
      if (event.button !== 0 || cards.length === 0 || !listeners) {
        return;
      }
      Object.assign(data, { seatPlayerId, zone, lenderPlayerId, cards, onRelease });
      setNodeRef(event.currentTarget);
      listeners.onPointerDown(event);
      // After dnd-kit has seen the press (it ignores prevented events): no
      // text selection and no native HTML5 drag of the card art.
      event.preventDefault();
    },
    [data, listeners, setNodeRef, seatPlayerId, zone, lenderPlayerId],
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
