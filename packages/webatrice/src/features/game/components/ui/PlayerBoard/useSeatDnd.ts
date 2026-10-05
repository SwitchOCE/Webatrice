import type { RefObject } from 'react';
import { useForkRef } from '@mui/material/utils';

import { SEAT_DROP_PRIORITY, type SeatZone } from '../../../hooks/seatDropPlan';
import type { SeatSelection, SeatSelectionApi } from '../../../hooks/useSeatSelection';
import { layoutVerticalPile, verticalPileDropIndex, type VerticalPileOptions } from '../VerticalPile/verticalPile';
import { useCanActFor } from '../CardVisualStateContext';
import { useActiveSeatDrag, useSeatDragSource, useSeatDropZone, type SeatDragStart } from '../SeatDragContext';
import type { BattlefieldCardViewModel, PlayerCardViewModel } from './playerBoard.types';

/** A card in any seat zone; battlefield cards also carry their owner. */
type HandCard = PlayerCardViewModel & Pick<BattlefieldCardViewModel, 'ownerPlayerId'>;
/** Which zone a drag was initiated from. */
type DragSourceZone = SeatZone;
/** A marquee selection is always within a single zone. */
type Selection = SeatSelection;
type ActiveSeatDrag = NonNullable<ReturnType<typeof useActiveSeatDrag>>;

export interface UseSeatDndArgs {
  seatId: number;
  /** The drag in progress from this seat, if any. */
  seatDrag: ActiveSeatDrag | null;
  selection: SeatSelection | null;
  setSelection: SeatSelectionApi['setSelection'];
  /** Resolve the game's pending attach pick against a press on one of this
   *  seat's battlefield cards; false when no attach pick is pending. */
  resolveAttachPress: (card: HandCard) => boolean;
  /** A card's printed P/T, from the seat's card metadata. */
  printedPT: (cardName: string) => string | undefined;
  stackDisplayList: readonly PlayerCardViewModel[];
  /** The hand strip in display order, which a hand reorder replays. */
  handDisplayList: readonly PlayerCardViewModel[];
  /** A hand row, or desktop's vertical hand column: which axis a hand drop reads. */
  horizontalHand: boolean;
  /** The seat root: the hand drop resolves against the hand cards inside it. */
  boxRef: RefObject<HTMLDivElement | null>;
  handRef: RefObject<HTMLDivElement | null>;
  stackRef: RefObject<HTMLDivElement | null>;
  libraryRef: RefObject<HTMLDivElement | null>;
  graveyardRef: RefObject<HTMLDivElement | null>;
  exileRef: RefObject<HTMLDivElement | null>;
  /** A press released on a card without dragging, once the selection has been updated. It is
   *  handed the selection as it was before the click, which desktop's single-click play reads. */
  onCardClick?: (zone: Selection['zone'], card: HandCard, e: PointerEvent, selectionBefore: Selection | null) => void;
  /** Card size at the current card scale, and how the stack lays out, for the stack drop. */
  CARD_W_PX: number;
  CARD_H_PX: number;
  stackPileOptions: VerticalPileOptions;
}

/**
 * The seat's part in the game's drag and drop (useGameDnd): its drag
 * sources (cards and piles), what a press that never became a drag does
 * (select, or resolve a pending attach), and the drop zones for its stack,
 * hand and piles (the battlefield registers its own). Returns the refs the
 * regions put on those zones.
 */
export function useSeatDnd({
  seatId,
  seatDrag,
  selection,
  setSelection,
  resolveAttachPress,
  printedPT,
  stackDisplayList,
  handDisplayList,
  horizontalHand,
  boxRef,
  handRef,
  stackRef,
  libraryRef,
  graveyardRef,
  exileRef,
  onCardClick,
  CARD_W_PX,
  CARD_H_PX,
  stackPileOptions,
}: UseSeatDndArgs) {
  // A card dragged out of any zone but the battlefield carries its printed
  // P/T, which it lands with if dropped on the battlefield.
  const withPrintedPT = (cards: readonly HandCard[], zone: DragSourceZone): readonly HandCard[] =>
    zone === 'battlefield'
      ? cards
      : cards.map((card) => {
        const pt = printedPT(card.name);
        return pt ? { ...card, printedPT: pt } : card;
      });

  const startPileDrag = (
    e: React.PointerEvent<HTMLElement>,
    card: HandCard,
    zone: Exclude<DragSourceZone, 'hand' | 'battlefield' | 'stack'>,
  ) => {
    seatDragSources[zone]?.(e, withPrintedPT([card], zone));
  };

  /** True if this specific card is currently part of an active drag.
   *  Only returns true after the pointer has moved past the threshold —
   *  a click that never becomes a drag doesn't hide its source. */
  const isDragging = (id: string, zone: DragSourceZone) =>
    seatDrag?.zone === zone && seatDrag.cards.some((c) => c.id === id);

  // A press released before the drag threshold (a click). Two readings:
  //   1. Pending-attach mode: an "Attach to card..." pick from any seat is
  //      pending; this click on a battlefield card resolves it.
  //   2. Normal click: replace the selection with the clicked card, then
  //      hand the click on (single-click play).
  const releaseCardPress = (zone: DragSourceZone, card: HandCard, e: PointerEvent) => {
    const clickedCardId = card.id;
    const clickedCardIdNum = Number(clickedCardId);
    // A press on a source card cancels the pick, as desktop's
    // ArrowAttachItem does when it lands on its start item; a press on any
    // other battlefield card attaches every source card to it.
    if (zone === 'battlefield' && Number.isFinite(clickedCardIdNum) && resolveAttachPress(card)) {
      return;
    }
    if (
      zone === 'hand' ||
      zone === 'battlefield' ||
      zone === 'stack'
    ) {
      // Ctrl (Windows/Linux) / ⌘ (Mac) adds to or toggles the
      // multi-selection instead of replacing it — matches
      // Cockatrice desktop's `Qt::ControlModifier` branch in
      // `AbstractCardItem::mousePressEvent` (line 294-295).
      //
      // Cockatrice technically allows the selection to span
      // multiple zones (drag filters back down to same-zone), but
      // our Selection shape is single-zoned (used to gate drag +
      // context-menu bulk actions), so Ctrl+Click in a DIFFERENT
      // zone replaces the selection with a new single-card set
      // rooted in the clicked zone. Same-zone Ctrl+Click toggles.
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && selection && selection.zone === zone) {
        const nextIds = new Set(selection.ids);
        if (nextIds.has(clickedCardId)) {
          nextIds.delete(clickedCardId);
        } else {
          nextIds.add(clickedCardId);
        }
        if (nextIds.size === 0) {
          setSelection(null);
        } else {
          setSelection({ zone, ids: nextIds });
        }
      } else {
        setSelection({
          zone,
          ids: new Set([clickedCardId]),
        });
      }
      onCardClick?.(zone, card, e, selection);
    }
  };

  // ---- Seat drag and drop (useGameDnd) ------------------------------------
  // The game's DnD coordinator drives these drags; this seat says what is
  // dragged and, for each zone it renders, where a drop on it lands (it owns
  // the zone's layout).

  // Desktop starts a card drag only for the local player's cards, or any
  // card for a judge (CardItem::mouseMoveEvent, getLocalOrJudge), by the
  // card's owner rather than the board it shows on. On another player's card
  // a press still selects but never drags.
  const canActFor = useCanActFor();
  const handDragSource = useSeatDragSource(`seat-${seatId}-hand`, {
    seatPlayerId: seatId,
    zone: 'hand',
    canMoveFor: canActFor,
  });
  const stackDragSource = useSeatDragSource(`seat-${seatId}-stack`, {
    seatPlayerId: seatId,
    zone: 'stack',
    canMoveFor: canActFor,
  });
  const graveyardDragSource = useSeatDragSource(`seat-${seatId}-graveyard`, {
    seatPlayerId: seatId,
    zone: 'graveyard',
    canMoveFor: canActFor,
  });
  const exileDragSource = useSeatDragSource(`seat-${seatId}-exile`, {
    seatPlayerId: seatId,
    zone: 'exile',
    canMoveFor: canActFor,
  });
  const battlefieldDragSource = useSeatDragSource(`seat-${seatId}-battlefield`, {
    seatPlayerId: seatId,
    canMoveFor: canActFor,
    zone: 'battlefield',
  });
  // Hidden zones: the library pile drags its top card (position 0). The
  // zone views (ZoneViewDialog) are drag sources of their own.
  const libraryDragSource = useSeatDragSource(`seat-${seatId}-library`, {
    seatPlayerId: seatId,
    zone: 'library',
    canMoveFor: canActFor,
  });
  const seatDragSources: Partial<Record<DragSourceZone, SeatDragStart>> = {
    battlefield: battlefieldDragSource,
    library: libraryDragSource,
    hand: handDragSource,
    stack: stackDragSource,
    graveyard: graveyardDragSource,
    exile: exileDragSource,
  };

  // A press on a card in the selection drags the whole selection, in display
  // order; anything else drags just the card (the selection is only touched
  // once the gesture ends). Both seats take part: clicking selects on any
  // battlefield. A click on a single card goes to releaseCardPress; one on a
  // card of a group only goes on to onCardClick.
  const startSeatCardDrag = (
    e: React.PointerEvent<HTMLElement>,
    card: HandCard,
    zone: Selection['zone'],
    zoneCards: readonly HandCard[],
  ) => {
    const start = seatDragSources[zone];
    if (!start) {
      return;
    }
    if (selection && selection.zone === zone && selection.ids.has(card.id)) {
      // Only the selected cards in the pressed card's own zone come along
      // (desktop CardItem::mouseMoveEvent): a card attached across seats
      // lives in its owner's TABLE, not this seat's.
      const ownerOf = (c: HandCard) => c.ownerPlayerId ?? seatId;
      const group = zoneCards.filter((c) => selection.ids.has(c.id) && ownerOf(c) === ownerOf(card));
      // A click on one card of a group keeps the group selected.
      start(e, withPrintedPT(group, zone), group.length === 1
        ? (up) => releaseCardPress(zone, card, up)
        : (up) => onCardClick?.(zone, card, up, selection));
    } else {
      start(e, withPrintedPT([card], zone), (up) => releaseCardPress(zone, card, up));
    }
  };

  const stackDropRef = useSeatDropZone(`seat-${seatId}-stack`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.stack,
    // Insertion index against the pile the user sees: cards dragged out of
    // the stack are hidden, so the pile re-flows without them.
    resolve: ({ pointer }, source) => {
      const stackEl = stackRef.current;
      if (!stackEl) {
        return null;
      }
      const rect = stackEl.getBoundingClientRect();
      const layoutCount = stackDisplayList.length - (source.zone === 'stack' ? source.cards.length : 0);
      const { positions } = layoutVerticalPile(layoutCount, rect.width, rect.height, CARD_W_PX, CARD_H_PX, stackPileOptions);
      const index = verticalPileDropIndex(positions.map((pos) => rect.top + pos.y), pointer.y, CARD_H_PX);
      return { zone: 'stack', index };
    },
  });
  const handDropRef = useSeatDropZone(`seat-${seatId}-hand`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.hand,
    // Insertion index among the hand cards not being dragged (the post-removal
    // position): in a row, the cards whose centre is left of the pointer; in a
    // column, the nearest gap between card tops (desktop's calcDropIndexFromY).
    resolve: ({ pointer }, source) => {
      const dragged = new Set(source.zone === 'hand' ? source.cards.map((c) => c.id) : []);
      const rects: DOMRect[] = [];
      boxRef.current?.querySelectorAll<HTMLElement>('[data-card][data-zone="hand"]').forEach((el) => {
        const id = el.dataset.cardId;
        if (id && !dragged.has(id)) {
          rects.push(el.getBoundingClientRect());
        }
      });
      const index = horizontalHand
        ? rects.filter((r) => pointer.x > r.left + r.width / 2).length
        : verticalPileDropIndex(rects.map((r) => r.top), pointer.y, CARD_H_PX);
      return { zone: 'hand', index, order: handDisplayList.map((c) => c.id) };
    },
  });
  const libraryDropRef = useSeatDropZone(`seat-${seatId}-library`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.library,
    resolve: () => ({ zone: 'library' }),
  });
  const graveyardDropRef = useSeatDropZone(`seat-${seatId}-graveyard`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.graveyard,
    resolve: () => ({ zone: 'graveyard' }),
  });
  const exileDropRef = useSeatDropZone(`seat-${seatId}-exile`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.exile,
    resolve: () => ({ zone: 'exile' }),
  });
  const stackZoneRef = useForkRef(stackRef, stackDropRef);
  const handZoneRef = useForkRef(handRef, handDropRef);
  const libraryZoneRef = useForkRef(libraryRef, libraryDropRef);
  const graveyardZoneRef = useForkRef(graveyardRef, graveyardDropRef);
  const exileZoneRef = useForkRef(exileRef, exileDropRef);

  return {
    startPileDrag,
    isDragging,
    startSeatCardDrag,
    stackZoneRef,
    handZoneRef,
    libraryZoneRef,
    graveyardZoneRef,
    exileZoneRef,
  };
}
