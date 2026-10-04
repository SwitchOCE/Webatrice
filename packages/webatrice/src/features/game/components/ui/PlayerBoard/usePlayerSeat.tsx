import { useMemo, useRef } from 'react';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';
import { useBoardAnimations, usePreference } from '@app/hooks';

import { useHorizontalWheelScroll } from '../../../hooks/useHorizontalWheelScroll';
import { useMoveTopUntil } from '../../../hooks/useMoveTopUntil';
import { useSeatSelection } from '../../../hooks/useSeatSelection';
import {
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
} from '../../battlefield/Battlefield/battlefieldLayout';
import { useBattlefieldMenuItems } from '../../battlefield/Battlefield/useBattlefieldMenuItems';
import {
  STACK_MIN_CARD_VISIBLE_PX,
  VERTICAL_PILE_X_SPACE_PX,
  type VerticalPileOptions,
} from '../VerticalPile/verticalPile';
import { useCardScale } from '../CardScaleContext';
import { useGameDialogsContext } from '../GameDialogsContext';
import { useGameSelectionState } from '../GameSelectionContext';
import { useHandMenuItems } from '../HandZone/useHandMenuItems';
import { useActiveSeatDrag } from '../SeatDragContext';
import { useLibraryMenuItems } from '../ZoneStack/useLibraryMenuItems';
import { usePileMenus } from '../ZoneStack/usePileMenus';
import type {
  PlayerBoardCommands,
  PlayerBoardModel,
} from './playerBoard.types';
import { useDrawFlights } from './useDrawFlights';
import { usePendingArrows } from './usePendingArrows';
import { useSeatCardMetadata } from './useSeatCardMetadata';
import { useSeatClickToPlay } from './useSeatClickToPlay';
import { useSeatDnd } from './useSeatDnd';
import { useSeatMarquee } from './useSeatMarquee';
import { useSeatPrompts } from './useSeatPrompts';
import { useSeatShortcutOperations } from './useSeatShortcutOperations';
import { seatGrid as buildSeatGrid } from './seatGrid';

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
 * The seat controller: composes the seat's hooks (card metadata, selection,
 * marquee, prompts, pending arrows, menus, shortcuts, drag and drop) over the
 * seat model and command ports. PlayerBoard provides the result to its
 * regions through PlayerSeatContext.
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
  // The seat's zone views, card menus and move-top-until dialog are game
  // dialogs.
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
  // The stack and a vertical hand are desktop's vertical piles: cards overlap
  // by "Minimum overlap percentage of cards on the stack and in vertical hand",
  // and the stack keeps at least MIN_CARD_VISIBLE of each card showing.
  const overlapPercent = usePreference('verticalCardOverlapPercent');
  const handPileOptions = useMemo<VerticalPileOptions>(
    () => ({ overlapPercent, xSpace: VERTICAL_PILE_X_SPACE_PX * scale }),
    [overlapPercent, scale],
  );
  const stackPileOptions = useMemo<VerticalPileOptions>(
    () => ({ ...handPileOptions, minOffset: STACK_MIN_CARD_VISIBLE_PX * scale }),
    [handPileOptions, scale],
  );

  // Appearance › Hand layout: a hand row (desktop's default) or a hand column.
  const horizontalHand = usePreference('horizontalHand');
  const seatGrid = useMemo(() => buildSeatGrid({ horizontalHand, handOnTop }), [horizontalHand, handOnTop]);

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

  const { flights, DRAW_ANIMATION_MS } = useDrawFlights({
    drawSeq,
    lastDrawCount,
    libraryRef,
    handRef,
    enabled: useBoardAnimations(),
  });

  const draw = (n: number) => {
    // Server pops N off the top of the deck and broadcasts
    // Event_DrawCards; Redux updates hand + deck.cardCount from the
    // event, and the draw beacon starts the library→hand flights.
    zoneCommands.draw(n);
  };

  // The zones' elements, measured by the drop resolvers and the marquee.
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
  // The seat drag in progress from this seat, if any.
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
  // Displayed counts mirror Cockatrice desktop: read straight from the
  // server-authoritative `zone.cardCount` and DON'T decrement while a
  // card is under the cursor mid-drag. The desktop client also shows
  // the same pre-drop count until the server broadcasts the move back;
  // the visible "card in flight" is the drag ghost, not a badge tweak.
  // Zero before the player hydrates.
  const displayedDeckCount = zones.library.cardCount ?? 0;
  const displayedGraveyardCount = zones.graveyard.cardCount ?? 0;
  const displayedExileCount = zones.exile.cardCount ?? 0;

  // Zone lists come straight from the seat model: an empty zone renders
  // empty, not "the last thing we knew about".
  const graveDisplayList = zones.graveyard.cards;
  const exileDisplayList = zones.exile.cards;
  const handDisplayList = zones.hand.cards;
  const handCount = zones.hand.cardCount ?? handDisplayList.length;
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

  const { onCardClick, onCardDoubleClick } = useSeatClickToPlay({
    canAct: model.permissions.canAct,
    selection,
    handDisplayList,
    stackDisplayList,
    battlefieldDisplayList,
    cardMetaByName,
    setCardMetaByName,
    zoneCommands,
    cardCommands,
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
  });

  return {
    CARD_H_PX,
    CARD_W_PX,
    DRAW_ANIMATION_MS,
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
    handPileOptions,
    handSize,
    handZoneRef,
    horizontalHand,
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
    onCardDoubleClick,
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
    seatGrid,
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
    stackPileOptions,
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
