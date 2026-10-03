import { useMemo, useRef } from 'react';
import { useForkRef } from '@mui/material/utils';
import {
  layoutStackPile,
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
  STACK_PILE_HORIZONTAL_OFFSET_PX,
} from '../../battlefield/Battlefield/battlefieldLayout';
import {
} from '../../../hooks/dialogs/seatPrompts';
import type {
  PlayerBoardCommands,
  PlayerBoardModel,
  PlayerCardViewModel,
} from './playerBoard.types';
import { useCardScale } from '../CardScaleContext';
import { useSeatSelection, type SeatSelection } from '../../../hooks/useSeatSelection';
import { useMoveTopUntil } from '../../../hooks/useMoveTopUntil';
import { useGameSelectionState } from '../GameSelectionContext';
import { useCanActFor } from '../CardVisualStateContext';
import { SEAT_DROP_PRIORITY, type SeatZone } from '../../../hooks/seatDropPlan';
import { useActiveSeatDrag, useSeatDragSource, useSeatDropZone, type SeatDragStart } from '../SeatDragContext';
import { useGameDialogsContext } from '../GameDialogsContext';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';
import { useHorizontalWheelScroll } from '../../../hooks/useHorizontalWheelScroll';
import { MAX_COUNTER_VALUE } from './counterLimits';
import { useDrawFlights } from './useDrawFlights';
import { usePendingArrows } from './usePendingArrows';
import { useSeatCardMetadata } from './useSeatCardMetadata';
import { useSeatMarquee } from './useSeatMarquee';
import { useSeatPrompts } from './useSeatPrompts';
import { useSeatShortcutOperations } from './useSeatShortcutOperations';
import { usePileMenus } from '../ZoneStack/usePileMenus';
import { useLibraryMenuItems } from '../ZoneStack/useLibraryMenuItems';
import { useHandMenuItems } from '../HandZone/useHandMenuItems';
import { useBattlefieldMenuItems } from '../../battlefield/Battlefield/useBattlefieldMenuItems';

/** Seat card shape. Owned by the PlayerBoard seat contract. */
type HandCard = PlayerCardViewModel;

/** Which zone a drag was initiated from. */
type DragSourceZone = SeatZone;

/** A marquee selection is always within a single zone. */
type Selection = SeatSelection;

export type PlayerSeatProps = {
  /** What the seat shows: identity, zones, counters, permissions. */
  model: PlayerBoardModel;
  /** What the seat can ask for, grouped by zone / card / counter / target. */
  commands: PlayerBoardCommands;
  /** Webatrice's "Open deck in deck editor" link. Undefined when the game's
   *  deck matches none of the user's saved decks (see useOpenDeckInEditor). */
  onOpenDeckInEditor?: () => void;
};


/**
 * The seat's state, layout and actions: everything PlayerBox renders,
 * computed from the seat model and command ports. PlayerBox's regions read the result
 * through PlayerSeatContext while they move to their target owners
 * (refactor plan Phase 7).
 */
export function usePlayerSeat({ model, commands, onOpenDeckInEditor }: PlayerSeatProps) {
  const { seat, zones, counters } = model;
  const {
    zone: zoneCommands,
    card: cardCommands,
    counter: counterCommands,
    target: targetCommands,
  } = commands;
  const {
    playerId,
    isLocal: isSelf,
    isActive,
    mirrored: handOnTop,
    flipHandCardBacks,
    revealTargets,
    drawSeq,
    lastDrawCount,
  } = seat;
  const deckCards = model.deck;
  const manaCounters = counters.mana;
  const { alwaysRevealTopCard, alwaysLookAtTopCard, topCard: deckTopCard } = zones.library;
  // Life is the "life" counter: +/- sends a delta, the set-life prompt an
  // absolute value. Undefined until the counter exists.
  const lifeCounter = counters.life;
  const lifeControl = useMemo(() => lifeCounter && {
    value: lifeCounter.value,
    onDelta: (delta: number) => counterCommands.increment(lifeCounter.id, delta),
    onSet: (value: number) => counterCommands.set(lifeCounter.id, value),
  }, [lifeCounter, counterCommands]);
  const name = seat.displayName;
  // The seat's zone views (library, top / bottom N, graveyard, exile,
  // hand, sideboard) are game dialogs: openZoneView stacks one and dumps a
  // hidden zone. Hand-menu handlers already wired at the dialog layer:
  // `handleRequestSortHandBy` fires per-card moveCard dispatches
  // (hand_menu.cpp parity), `handleRequestChooseMulligan` opens a numeric
  // prompt then dispatches Command_Mulligan.
  const {
    openZoneView,
    openMoveTopUntil,
    seatCardMenu,
    openSeatCardMenu,
    closeSeatCardMenu,
  } = useGameDialogsContext();

  // The card scale (the header slider) sizes the stack pile and its drop
  // hit-test; the battlefield's own layout reads it in useBattlefieldLayout.
  const { scale } = useCardScale();
  const CARD_W_PX = CARD_W_PX_BASE * scale;
  const CARD_H_PX = CARD_H_PX_BASE * scale;
  const STACK_HOFFSET_PX = STACK_PILE_HORIZONTAL_OFFSET_PX * scale;

  const {
    cardMetaByName,
    setCardMetaByName,
    tokenMetaByName,
    resolveFaceImageUri,
    describeCard,
  } = useSeatCardMetadata({ isSelf, deckCards, battlefieldCards: zones.battlefield.cards });

  const deckCount = zones.library.cardCount ?? 0;

  // Refs for measuring the library card and hand zone positions so we can
  // animate a card back travelling between them.
  const libraryRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);

  const { flights, DRAW_ANIMATION_MS } = useDrawFlights({ drawSeq, lastDrawCount, libraryRef, handRef });

  const draw = (n: number) => {
    // Server pops N off the top of the deck and broadcasts
    // Event_DrawCards; Redux updates hand + deck.cardCount from the
    // event, and the draw beacon triggers the library→hand flight
    // animation via the effect below.
    zoneCommands.draw(n);
  };


  // Zone display data (hand/battlefield/grave/exile/stack) all comes from
  // Redux via props — see the *DisplayList expressions below. Refs are
  // kept locally so the drag hit-tester can measure each zone's rect.
  const graveyardRef = useRef<HTMLDivElement>(null);
  const exileRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  // Marquee selection. Selection is single-zone — the marquee groups whatever
  // it touches by zone and picks the zone contributing the most cards. It is
  // this seat's share of the game-level selection, so selecting anywhere else
  // (own or opponent seat) clears it.
  const selectableCards = useMemo(
    () => ({
      hand: zones.hand.cards,
      battlefield: zones.battlefield.cards,
      stack: zones.stack.cards,
    }),
    [zones.hand.cards, zones.battlefield.cards, zones.stack.cards],
  );
  const { selection, setSelection, clearAllSelection } = useSeatSelection(playerId, selectableCards);
  // The seat drag in progress from this seat (see the seat DnD block below).
  const seatId = playerId;
  const activeSeatDrag = useActiveSeatDrag();
  const seatDrag = activeSeatDrag?.seatPlayerId === seatId ? activeSeatDrag : null;
  // The seat's card menus: battlefield, pile view (graveyard / exile) and
  // stack. The open menu lives in the game dialog state, so it is one of the
  // game's mutually exclusive context menus; this seat renders it when it
  // opened it, and CardMenuPopup closes it on an outside click or Escape.
  const menuOwnerId = playerId;
  const gameSelection = useGameSelectionState();
  const seatMenu = seatCardMenu?.playerId === menuOwnerId ? seatCardMenu : null;
  const cardContextMenu = seatMenu?.kind === 'battlefield' ? seatMenu : null;
  const pileCardMenu = seatMenu?.kind === 'pile' ? seatMenu : null;
  const stackCardMenu = seatMenu?.kind === 'stack' ? seatMenu : null;
  // The seat root — used both to bound the marquee-start (only clicks
  // inside this box begin a marquee) and to query card elements when
  // finalizing the selection.
  const boxRef = useRef<HTMLDivElement>(null);


  // The hand row scrolls sideways under the mouse wheel (the battlefield
  // does the same for its own board).
  useHorizontalWheelScroll(handRef);
  const battlefieldDisplayList = zones.battlefield.cards;

  // Reactive shortcut-hint map — updates whenever the user rebinds a
  // shortcut in the Shortcuts tab. Consumed by every menu item that
  // shows a `shortcut:` chip so the hint always reflects the current
  // binding (Cockatrice desktop hardcodes; we can't since bindings
  // are user-customizable).
  const shortcutHints = useShortcutHints();



  const startPileDrag = (
    e: React.PointerEvent<HTMLElement>,
    card: HandCard,
    zone: Exclude<DragSourceZone, 'hand' | 'battlefield' | 'stack'>,
  ) => {
    seatDragSources[zone]?.(e, [card]);
  };

  /** True if this specific card is currently part of an active drag.
   *  Only returns true after the pointer has moved past the threshold —
   *  a click that never becomes a drag doesn't hide its source. */
  const isDragging = (id: string, zone: DragSourceZone) =>
    seatDrag?.zone === zone && seatDrag.cards.some((c) => c.id === id);

  // A press released before the drag threshold (a click). Two readings:
  //   1. Pending-attach mode: the previous "Attach to card..." menu choice
  //      set `attachPending`; this click on a battlefield card resolves the
  //      attach (or cancels if the user clicked the source card again).
  //   2. Normal click: replace the selection with the clicked card.
  const releaseCardPress = (zone: DragSourceZone, clickedCardId: string, e: PointerEvent) => {
    const clickedCardIdNum = Number(clickedCardId);
    const pending = attachPendingRef.current;
    if (
      pending &&
      zone === 'battlefield' &&
      Number.isFinite(clickedCardIdNum) &&
      playerId != null
    ) {
      const extras = attachExtraSourceIdsRef.current;
      const allSources = [pending.sourceCardId, ...extras];
      if (allSources.includes(clickedCardIdNum)) {
        // Clicked a source card = cancel. Cockatrice's
        // ArrowAttachItem does the same via `targetItem == startItem`
        // short-circuit; we extend to any source in a multi-attach.
        setAttachPending(null);
        setAttachExtraSourceIds([]);
      } else {
        // Attach every source card to the clicked target. Server
        // treats each attach independently (no batch wire), so we
        // loop.
        for (const sourceCardId of allSources) {
          targetCommands.attach(sourceCardId, { playerId, cardId: clickedCardIdNum });
        }
        setAttachPending(null);
        setAttachExtraSourceIds([]);
      }
    } else if (
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
    }
  };

  const { marquee, onPointerDownBox } = useSeatMarquee({ playerId, boxRef, handRef, stackRef, setSelection, clearAllSelection });


  const {
    life,
    setLife,
    openLifePrompt,
    openCounterPrompt,
    openAnnotationPrompt,
    openPTPrompt,
    openMoveXFromTopPrompt,
    openCountPrompt,
    openDrawCardsPrompt,
    openViewLibraryCountPrompt,
    openRevealTopCardsPrompt,
    openCardCounterPrompt,
    lastToken,
    openCreateTokenDialog,
  } = useSeatPrompts({
    seatId,
    lifeControl,
    battlefieldCards: battlefieldDisplayList,
    cardMetaByName,
    draw,
    zoneCommands,
    cardCommands,
    counterCommands,
  });
  const {
    attachPending,
    setAttachPending,
    attachExtraSourceIds,
    setAttachExtraSourceIds,
    attachPendingRef,
    attachExtraSourceIdsRef,
    drawArrowPending,
    setDrawArrowPending,
    pendingArrowPointer,
  } = usePendingArrows({ playerId, targetCommands });
  // Placeholder values — real state lands with the game-state iteration.
  // Displayed counts mirror Cockatrice desktop: read straight from the
  // server-authoritative `zone.cardCount` and DON'T decrement while a
  // card is under the cursor mid-drag. The desktop client also shows
  // the same pre-drop count until the server broadcasts the move back;
  // the visible "card in flight" is the drag ghost, not a badge tweak.
  // Fall back to the local mock zone length only for the pre-hydration
  // transient (before Redux has any zone data at all).
  const displayedDeckCount = zones.library.cardCount ?? 0;
  const displayedGraveyardCount = zones.graveyard.cardCount ?? 0;
  const displayedExileCount = zones.exile.cardCount ?? 0;

  // All zone display lists come straight from Redux — there is no local
  // mock any more. Empty arrays are truthful (an empty zone renders
  // empty, not "the last thing we knew about"). Owner-side pile drags
  // grab the last card in the display list; opponent-side pile drags
  // show a card-back count only (Redux gives us `zone.cardCount`
  // without the actual card identities for hidden zones).
  const graveDisplayList = zones.graveyard.cards;
  const exileDisplayList = zones.exile.cards;
  const handDisplayList = zones.hand.cards;
  const handCount = zones.hand.cardCount ?? handDisplayList.length;

  // Same "trust Redux in real games" rule as grave/exile above — see
  // that comment for the mock-id mismatch bug this avoids.
  const stackDisplayList = zones.stack.cards;

  // "Put top cards on stack until…": the dialog is a game dialog; the
  // reveal loop runs on this seat's stack (desktop moveOneCardUntil).
  const startMoveTopUntil = useMoveTopUntil({
    enabled: isSelf,
    stackCards: stackDisplayList,
    deckCount,
    describeCard,
    moveCards: zoneCommands.moveCards,
  });
  const openMoveTopUntilDialog = () => openMoveTopUntil({ onSubmit: startMoveTopUntil });

  const {
    graveMenuItemsSelf,
    graveMenuItemsOpponent,
    exileMenuItemsSelf,
    exileMenuItemsOpponent,
  } = usePileMenus({
    seatId,
    revealTargets,
    graveDisplayList,
    exileDisplayList,
    displayedGraveyardCount,
    displayedExileCount,
    shortcutHints,
    zoneCommands,
  });
  const {
    libraryMenuItems,
  } = useLibraryMenuItems({
    seatId,
    deckCount,
    revealTargets,
    alwaysRevealTopCard,
    alwaysLookAtTopCard,
    draw,
    openCountPrompt,
    openDrawCardsPrompt,
    openViewLibraryCountPrompt,
    openRevealTopCardsPrompt,
    openMoveTopUntilDialog,
    onOpenDeckInEditor,
    shortcutHints,
    zoneCommands,
  });
  const {
    handSize,
    handMenuItems,
  } = useHandMenuItems({ seatId, isSelf, hand: zones.hand, revealTargets, shortcutHints, zoneCommands });
  const {
    battlefieldMenuItems,
    opponentBattlefieldMenuItems,
  } = useBattlefieldMenuItems({
    handMenuItems,
    libraryMenuItems,
    graveMenuItemsSelf,
    graveMenuItemsOpponent,
    exileMenuItemsSelf,
    exileMenuItemsOpponent,
    lifeControl,
    openLifePrompt,
    openCounterPrompt,
    manaCounters,
    selection,
    battlefieldDisplayList,
    lastToken,
    openCreateTokenDialog,
    shortcutHints,
    cardCommands,
    counterCommands,
  });
  useSeatShortcutOperations({
    isSelf,
    selection,
    setSelection,
    battlefieldDisplayList,
    cardMetaByName,
    deckCount,
    alwaysRevealTopCard,
    alwaysLookAtTopCard,
    manaCounters,
    lifeControl,
    lastToken,
    openLifePrompt,
    openCounterPrompt,
    openAnnotationPrompt,
    openPTPrompt,
    openViewLibraryCountPrompt,
    openCardCounterPrompt,
    openCreateTokenDialog,
    openMoveTopUntilDialog,
    setAttachPending,
    setAttachExtraSourceIds,
    setDrawArrowPending,
    zoneCommands,
    cardCommands,
    counterCommands,
    targetCommands,
  });

  // ---- Seat drag and drop (useGameDnd) ------------------------------------
  // The game's DnD coordinator drives these drags; this seat says what is
  // dragged and, for each zone it renders, where a drop on it lands (it owns
  // the zone's layout).

  // Desktop starts a card drag only for the local player's cards, or any
  // card for a judge (CardItem::mouseMoveEvent, getLocalOrJudge). On any
  // other seat a press still selects but never drags.
  const canMoveSeatCards = useCanActFor()(seatId);
  const handDragSource = useSeatDragSource(`seat-${seatId}-hand`, {
    seatPlayerId: seatId,
    zone: 'hand',
    canDrag: canMoveSeatCards,
  });
  const stackDragSource = useSeatDragSource(`seat-${seatId}-stack`, {
    seatPlayerId: seatId,
    zone: 'stack',
    canDrag: canMoveSeatCards,
  });
  const graveyardDragSource = useSeatDragSource(`seat-${seatId}-graveyard`, {
    seatPlayerId: seatId,
    zone: 'graveyard',
    canDrag: canMoveSeatCards,
  });
  const exileDragSource = useSeatDragSource(`seat-${seatId}-exile`, {
    seatPlayerId: seatId,
    zone: 'exile',
    canDrag: canMoveSeatCards,
  });
  const battlefieldDragSource = useSeatDragSource(`seat-${seatId}-battlefield`, {
    seatPlayerId: seatId,
    canDrag: canMoveSeatCards,
    zone: 'battlefield',
  });
  // Hidden zones: the library pile drags its top card (position 0). The
  // zone views (ZoneViewDialog) are drag sources of their own.
  const libraryDragSource = useSeatDragSource(`seat-${seatId}-library`, {
    seatPlayerId: seatId,
    zone: 'library',
    canDrag: canMoveSeatCards,
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
  // battlefield. A click on a single card goes to releaseCardPress.
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
      const group = zoneCards.filter((c) => selection.ids.has(c.id));
      start(e, group, group.length === 1 ? (up) => releaseCardPress(zone, card.id, up) : undefined);
    } else {
      start(e, [card], (up) => releaseCardPress(zone, card.id, up));
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
      const positions = layoutStackPile(layoutCount, rect.width, rect.height, CARD_W_PX, CARD_H_PX, STACK_HOFFSET_PX);
      const index = positions.filter((pos) => pointer.y > rect.top + pos.y + CARD_H_PX / 2).length;
      return { zone: 'stack', index };
    },
  });
  const handDropRef = useSeatDropZone(`seat-${seatId}-hand`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.hand,
    // Insertion index = hand cards whose centre is left of the pointer,
    // not counting the cards being dragged: the post-removal position.
    resolve: ({ pointer }, source) => {
      const dragged = new Set(source.zone === 'hand' ? source.cards.map((c) => c.id) : []);
      let index = 0;
      boxRef.current?.querySelectorAll<HTMLElement>('[data-card][data-zone="hand"]').forEach((el) => {
        const id = el.dataset.cardId;
        if (!id || dragged.has(id)) {
          return;
        }
        const r = el.getBoundingClientRect();
        if (pointer.x > r.left + r.width / 2) {
          index++;
        }
      });
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
    CARD_H_PX,
    CARD_W_PX,
    DRAW_ANIMATION_MS,
    MAX_COUNTER_VALUE,
    STACK_HOFFSET_PX,
    alwaysLookAtTopCard,
    alwaysRevealTopCard,
    attachExtraSourceIds,
    attachPending,
    battlefieldDisplayList,
    battlefieldMenuItems,
    boxRef,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    closeSeatCardMenu,
    counterCommands,
    deckCount,
    deckTopCard,
    displayedDeckCount,
    displayedExileCount,
    displayedGraveyardCount,
    draw,
    drawArrowPending,
    exileDisplayList,
    exileMenuItemsOpponent,
    exileMenuItemsSelf,
    exileZoneRef,
    flights,
    flipHandCardBacks,
    gameSelection,
    graveDisplayList,
    graveMenuItemsOpponent,
    graveMenuItemsSelf,
    graveyardZoneRef,
    handCount,
    handDisplayList,
    handMenuItems,
    handOnTop,
    handSize,
    handZoneRef,
    isActive,
    isDragging,
    isSelf,
    libraryZoneRef,
    life,
    lifeControl,
    manaCounters,
    marquee,
    menuOwnerId,
    name,
    onOpenDeckInEditor,
    onPointerDownBox,
    openAnnotationPrompt,
    openCardCounterPrompt,
    openCountPrompt,
    openDrawCardsPrompt,
    openMoveTopUntilDialog,
    openMoveXFromTopPrompt,
    openPTPrompt,
    openRevealTopCardsPrompt,
    openSeatCardMenu,
    openViewLibraryCountPrompt,
    openZoneView,
    opponentBattlefieldMenuItems,
    pendingArrowPointer,
    pileCardMenu,
    playerId,
    resolveFaceImageUri,
    revealTargets,
    seat,
    seatDrag,
    seatId,
    selection,
    setAttachExtraSourceIds,
    setAttachPending,
    setCardMetaByName,
    setDrawArrowPending,
    setLife,
    setSelection,
    shortcutHints,
    stackCardMenu,
    stackDisplayList,
    stackZoneRef,
    startPileDrag,
    startSeatCardDrag,
    targetCommands,
    tokenMetaByName,
    zoneCommands,
    zones,
  };
}

export type PlayerSeat = ReturnType<typeof usePlayerSeat>;
