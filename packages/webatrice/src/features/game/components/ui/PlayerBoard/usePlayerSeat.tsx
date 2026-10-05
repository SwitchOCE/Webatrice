import { useCallback, useMemo, useRef } from 'react';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { useMenuShortcut } from '@app/feature-widgets/shortcuts';
import { useBoardAnimations, usePreference } from '@app/hooks';

import { useHorizontalWheelScroll } from '../../../hooks/useHorizontalWheelScroll';
import { useMoveTopUntil } from '../../../hooks/useMoveTopUntil';
import { useSeatSelection, type SeatSelectionZone } from '../../../hooks/useSeatSelection';
import {
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
} from '../../battlefield/Battlefield/battlefieldLayout';
import { useBattlefieldMenuItems } from '../../battlefield/Battlefield/useBattlefieldMenuItems';
import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { buildRelatedViewItems } from '../../context-menus/CardContextMenu/relatedCardActions';
import { useCardPreviewActions } from '../CardPreviewContext';
import {
  STACK_MIN_CARD_VISIBLE_PX,
  VERTICAL_PILE_X_SPACE_PX,
  type VerticalPileOptions,
} from '../VerticalPile/verticalPile';
import { useCardScale } from '../CardScaleContext';
import { usePendingTargetContext } from '../PendingTargetContext';
import { useGameDialogsContext } from '../GameDialogsContext';
import { EMPTY_CARD_KEYS, useGameSelectionState } from '../GameSelectionContext';
import { useHandMenuItems } from '../HandZone/useHandMenuItems';
import { useActiveSeatDrag } from '../SeatDragContext';
import { useLibraryMenuItems } from '../ZoneStack/useLibraryMenuItems';
import { usePileMenus } from '../ZoneStack/usePileMenus';
import type {
  ArrowTarget,
  PlayerBoardCommands,
  PlayerBoardModel,
  PlayerCardViewModel,
} from './playerBoard.types';
import { useBattlefieldCardOps } from './useBattlefieldCardOps';
import { useDrawFlights } from './useDrawFlights';
import { useSeatCardMetadata } from './useSeatCardMetadata';
import { useSeatClickToPlay } from './useSeatClickToPlay';
import { useSeatDnd } from './useSeatDnd';
import { useKeyboardMove } from '../KeyboardMoveContext';
import { useSeatMarquee } from './useSeatMarquee';
import { useSeatPrompts } from './useSeatPrompts';
import { useSeatShortcutOperations } from './useSeatShortcutOperations';
import { seatGrid as buildSeatGrid } from './seatGrid';

const NO_CARD_IDS: readonly number[] = [];

export type PlayerSeatProps = {
  /** What the seat shows: identity, zones, counters, permissions. */
  model: PlayerBoardModel;
  /** What the seat can ask for, grouped by zone / card / counter / target. */
  commands: PlayerBoardCommands;
  /** "Open deck in deck editor": opens the deck being played in the deck
   *  editor as an unsaved draft (desktop actOpenDeckInDeckEditor). Undefined,
   *  disabling the menu item, until the seat's deck is known. */
  onOpenDeckInEditor?: () => void;
  /** Sends a message macro to the game chat (the local seat's Say menu). */
  onSay?: (message: string) => void;
};

/**
 * The seat controller: composes the seat's hooks (card metadata, selection,
 * marquee, prompts, pending arrows, menus, shortcuts, drag and drop) over the
 * seat model and command ports. PlayerBoard provides the result to its
 * regions through PlayerSeatContext.
 */
export function usePlayerSeat({ model, commands, onOpenDeckInEditor, onSay }: PlayerSeatProps) {
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
  const otherVisibleCards = useMemo(
    () => [
      zones.stack.cards,
      zones.graveyard.cards,
      zones.exile.cards,
      zones.library.revealedCards,
      zones.sideboard.revealedCards,
    ],
    [zones.stack.cards, zones.graveyard.cards, zones.exile.cards, zones.library.revealedCards, zones.sideboard.revealedCards],
  );
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
  } = useSeatCardMetadata({ isSelf, deckCards, battlefieldCards: zones.battlefield.cards, otherVisibleCards });
  // "View related cards" for a card menu (desktop addRelatedCardView). A
  // relation resolves once the catalog has found it; the item shows that
  // card in the sidebar's card-info pane.
  const { showCardInfo } = useCardPreviewActions();
  const relatedViewItemsFor = (cardName: string): ContextMenuItem[] =>
    buildRelatedViewItems(
      cardMetaByName.get(cardName)?.related ?? [],
      (name) => tokenMetaByName.get(name)?.found ?? false,
      (ref) => {
        showCardInfo({ name: ref.name, scryfallId: ref.scryfallId });
        closeSeatCardMenu();
      },
    );

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
  // The seat's card menus: battlefield, pile view (graveyard / exile),
  // stack, hand and library / sideboard view. The open menu lives in the
  // game dialog state, so it is one of the game's mutually exclusive
  // context menus; this seat renders it when it
  // opened it, and the menu closes it on an outside click or Escape.
  const menuOwnerId = playerId;
  const gameSelection = useGameSelectionState();
  const seatMenu = seatCardMenu?.playerId === menuOwnerId ? seatCardMenu : null;
  const cardContextMenu = seatMenu?.kind === 'battlefield' ? seatMenu : null;
  const pileCardMenu = seatMenu?.kind === 'pile' ? seatMenu : null;
  const stackCardMenu = seatMenu?.kind === 'stack' ? seatMenu : null;
  const handCardMenu = seatMenu?.kind === 'hand' ? seatMenu : null;
  const zoneViewCardMenu = seatMenu?.kind === 'zoneView' ? seatMenu : null;
  // The seat root — used both to bound the marquee-start (only clicks
  // inside this box begin a marquee) and to query card elements when
  // finalizing the selection.
  const boxRef = useRef<HTMLDivElement>(null);

  // The hand row scrolls sideways under the mouse wheel (the battlefield
  // does the same for its own board).
  useHorizontalWheelScroll(handRef);
  const battlefieldDisplayList = zones.battlefield.cards;

  // Every menu item's shortcut hint and aria-keyshortcuts, from the current
  // bindings, so they follow a rebinding in the Shortcuts tab (desktop's
  // menus show its fixed defaults).
  const menuShortcut = useMenuShortcut();

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
  // The game's pending target pick, as far as it starts from this seat: the
  // seat rings its attach sources and draws the live arrow from its card.
  const pendingTarget = usePendingTargetContext();
  const seatPending = pendingTarget.pending?.source.playerId === playerId ? pendingTarget.pending : null;
  const attachPending = useMemo(
    () => (seatPending?.kind === 'attach'
      ? { sourceCardId: seatPending.source.cardId, sourceCardName: seatPending.source.name }
      : null),
    [seatPending],
  );
  const attachExtraSourceIds = seatPending?.kind === 'attach' ? seatPending.extraSourceIds : NO_CARD_IDS;
  const { startArrow: startPendingArrow, startAttach: startPendingAttach, pickAttachTarget, pickArrowAt } = pendingTarget;
  // Any seat's pick: an attach may land on any player's battlefield card.
  const attachPicking = pendingTarget.pending?.kind === 'attach';
  /** "Draw arrow..." from one of this seat's cards in any zone, the hand included. */
  const startDrawArrow = useCallback(
    ({ sourceCardId, sourceCardName, sourceZone }: { sourceCardId: number; sourceCardName: string; sourceZone: ZoneNameValue }) =>
      startPendingArrow({ playerId, zone: sourceZone, cardId: sourceCardId, name: sourceCardName }),
    [startPendingArrow, playerId],
  );
  /** "Attach to card..." from these cards of one zone; the first carries the arrow. */
  const startAttach = useCallback(
    (sourceCardIds: readonly number[], anchorName: string, sourceZone: ZoneNameValue = ZoneName.TABLE) => {
      const [anchorId, ...extraIds] = sourceCardIds;
      startPendingAttach({ playerId, zone: sourceZone, cardId: anchorId, name: anchorName }, extraIds);
    },
    [startPendingAttach, playerId],
  );
  const startTableArrow = useCallback(
    (sourceCardId: number, sourceCardName: string) => startDrawArrow({ sourceCardId, sourceCardName, sourceZone: ZoneName.TABLE }),
    [startDrawArrow],
  );
  // A battlefield card of this seat as a pick target: its zone's owner (a
  // cross-player attachment lives in its owner's TABLE) and whether it is
  // attached itself, which desktop refuses as an attach target.
  const battlefieldTarget = (card: { id: string; ownerPlayerId?: number }): ArrowTarget => {
    const onTable = zones.battlefield.cards.find((c) => c.id === card.id);
    return {
      kind: 'card',
      playerId: card.ownerPlayerId ?? onTable?.ownerPlayerId ?? playerId,
      zone: ZoneName.TABLE,
      cardId: Number(card.id),
      attached: onTable?.attachTargetCardId != null && onTable.attachTargetCardId >= 0,
    };
  };
  // A press on one of this seat's battlefield cards resolves the game's
  // attach pick, whichever seat it started from: desktop attaches to any
  // table card, an opponent's included (ArrowAttachItem::attachCards).
  const resolveAttachPress = (card: { id: string; ownerPlayerId?: number }) =>
    attachPicking && pickAttachTarget(battlefieldTarget(card));
  // The battlefield card actions behind both the card menu and the shortcuts.
  const cardOps = useBattlefieldCardOps({
    cards: battlefieldDisplayList,
    selection,
    setSelection,
    cardMetaByName,
    deckCount,
    lifeControl,
    cardCommands,
    counterCommands,
    targetCommands,
    zoneCommands,
    prompts: { openAnnotationPrompt, openPTPrompt, openCardCounterPrompt, openMoveXFromTopPrompt },
    startAttach,
    startArrow: startTableArrow,
  });
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
    menuShortcut,
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
    menuShortcut,
    zoneCommands,
  });
  const {
    handSize,
    handMenuItems,
  } = useHandMenuItems({ seatId, isSelf, hand: zones.hand, revealTargets, menuShortcut, zoneCommands });
  const {
    battlefieldMenuItems,
    opponentBattlefieldMenuItems,
  } = useBattlefieldMenuItems({
    seatId,
    customZones: zones.customZones ?? [],
    onSay,
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
    incrementAllCardCounters: cardOps.incrementAllCounters,
    battlefieldDisplayList,
    lastToken,
    openCreateTokenDialog,
    menuShortcut,
    cardCommands,
    counterCommands,
  });
  useSeatShortcutOperations({
    seatId,
    isSelf,
    selection,
    selectedCardKeys: gameSelection?.selectedCardKeys ?? EMPTY_CARD_KEYS,
    deckCount,
    alwaysRevealTopCard,
    alwaysLookAtTopCard,
    manaCounters,
    lastToken,
    openLifePrompt,
    openCounterPrompt,
    openViewLibraryCountPrompt,
    openCreateTokenDialog,
    openMoveTopUntilDialog,
    cardOps,
    zoneCommands,
    cardCommands,
    counterCommands,
    targetCommands,
  });

  const { onCardClick, onCardDoubleClick, onCardActivate } = useSeatClickToPlay({
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

  // Enter on a focused card: a pending target pick takes it (desktop's arrow
  // or attach release on the card); otherwise it plays or taps, as a click does.
  // An arrow takes what a click there would (arrowTargetAt: a public zone's
  // card, never a hand card); an attach only a battlefield card, as a press
  // does (useSeatDnd), and Enter elsewhere leaves it pending.
  const activateCard = (
    zone: SeatSelectionZone,
    card: PlayerCardViewModel & { ownerPlayerId?: number },
    element: HTMLElement,
  ) => {
    if (pickArrowAt(element)) {
      return;
    }
    if (attachPicking) {
      if (zone === 'battlefield') {
        pickAttachTarget(battlefieldTarget(card));
      }
      return;
    }
    onCardActivate(zone, card);
  };
  // Shift+F10 or the Menu key on a focused card: its menu, under the card.
  const openCardMenuAt = (zone: SeatSelectionZone, card: { id: string }, rect: DOMRect) =>
    openSeatCardMenu({ kind: zone, playerId: menuOwnerId, cardId: card.id, x: rect.left, y: rect.bottom });

  const {
    startPileDrag,
    isDragging,
    startSeatCardDrag,
    keyboardMoveSource,
    stackZoneRef,
    handZoneRef,
    libraryZoneRef,
    graveyardZoneRef,
    exileZoneRef,
  } = useSeatDnd({
    seatId,
    seatDrag,
    selection,
    setSelection,
    resolveAttachPress,
    printedPT: (cardName) => cardMetaByName.get(cardName)?.pt,
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

  // M on a focused card: the keyboard move (MoveCardsDialog), carrying what
  // a drag of the card would.
  const requestKeyboardMove = useKeyboardMove();
  const moveWithKeyboard = (zone: SeatSelectionZone, card: PlayerCardViewModel & { ownerPlayerId?: number }) => {
    const zoneCards = zone === 'battlefield' ? battlefieldDisplayList : zone === 'hand' ? handDisplayList : stackDisplayList;
    const source = keyboardMoveSource(card, zone, zoneCards);
    if (source && requestKeyboardMove) {
      requestKeyboardMove({ source, name: card.name });
    }
  };

  return {
    moveWithKeyboard,
    CARD_H_PX,
    CARD_W_PX,
    DRAW_ANIMATION_MS,
    alwaysLookAtTopCard,
    alwaysRevealTopCard,
    attachExtraSourceIds,
    activateCard,
    attachPending,
    attachPicking,
    battlefieldDisplayList,
    battlefieldMenuItems,
    boxRef,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    cardOps,
    closeSeatCardMenu,
    counterCommands,
    deckCount,
    deckTopCard,
    displayedDeckCount,
    displayedExileCount,
    displayedGraveyardCount,
    draw,
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
    handCardMenu,
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
    libraryMenuItems,
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
    openCardMenuAt,
    openCountPrompt,
    openDrawCardsPrompt,
    openLifePrompt,
    openMoveTopUntilDialog,
    openMoveXFromTopPrompt,
    openPTPrompt,
    openRevealTopCardsPrompt,
    openSeatCardMenu,
    openViewLibraryCountPrompt,
    openZoneView,
    opponentBattlefieldMenuItems,
    pileCardMenu,
    playerId,
    relatedViewItemsFor,
    resolveFaceImageUri,
    revealTargets,
    seat,
    seatDrag,
    seatGrid,
    seatId,
    seatPending,
    selection,
    setCardMetaByName,
    setLife,
    setSelection,
    menuShortcut,
    stackCardMenu,
    stackDisplayList,
    stackPileOptions,
    stackZoneRef,
    startAttach,
    startDrawArrow,
    startPileDrag,
    startSeatCardDrag,
    targetCommands,
    tokenMetaByName,
    zoneCommands,
    zoneViewCardMenu,
    zones,
  };
}

export type PlayerSeat = ReturnType<typeof usePlayerSeat>;
