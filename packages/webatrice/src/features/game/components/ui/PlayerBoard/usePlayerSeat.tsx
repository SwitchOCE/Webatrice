import { useMemo, useRef } from 'react';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';

import {
} from '../../../hooks/dialogs/seatPrompts';
import { useHorizontalWheelScroll } from '../../../hooks/useHorizontalWheelScroll';
import { useMoveTopUntil } from '../../../hooks/useMoveTopUntil';
import { useSeatSelection } from '../../../hooks/useSeatSelection';
import {
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
  STACK_PILE_HORIZONTAL_OFFSET_PX,
} from '../../battlefield/Battlefield/battlefieldLayout';
import { useBattlefieldMenuItems } from '../../battlefield/Battlefield/useBattlefieldMenuItems';
import { useCardScale } from '../CardScaleContext';
import { useGameDialogsContext } from '../GameDialogsContext';
import { useGameSelectionState } from '../GameSelectionContext';
import { useHandMenuItems } from '../HandZone/useHandMenuItems';
import { useActiveSeatDrag } from '../SeatDragContext';
import { useLibraryMenuItems } from '../ZoneStack/useLibraryMenuItems';
import { usePileMenus } from '../ZoneStack/usePileMenus';
import { MAX_COUNTER_VALUE } from './counterLimits';
import type {
  PlayerBoardCommands,
  PlayerBoardModel,
} from './playerBoard.types';
import { useDrawFlights } from './useDrawFlights';
import { usePendingArrows } from './usePendingArrows';
import { useSeatCardMetadata } from './useSeatCardMetadata';
import { useSeatDnd } from './useSeatDnd';
import { useSeatMarquee } from './useSeatMarquee';
import { useSeatPrompts } from './useSeatPrompts';
import { useSeatShortcutOperations } from './useSeatShortcutOperations';

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

  const {
    startPileDrag,
    isDragging,
    startSeatCardDrag,
    stackZoneRef,
    handZoneRef,
    libraryZoneRef,
    graveyardZoneRef,
    exileZoneRef,
  } = useSeatDnd({
    seatId,
    playerId,
    seatDrag,
    selection,
    setSelection,
    attachPendingRef,
    attachExtraSourceIdsRef,
    setAttachPending,
    setAttachExtraSourceIds,
    targetCommands,
    stackDisplayList,
    boxRef,
    handRef,
    stackRef,
    libraryRef,
    graveyardRef,
    exileRef,
    CARD_W_PX,
    CARD_H_PX,
    STACK_HOFFSET_PX,
  });

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
