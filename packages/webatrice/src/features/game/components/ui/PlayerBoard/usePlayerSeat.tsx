import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Where a marquee started — one of the three selectable zones. A single
 *  marquee never bridges zones; for battlefield, the owning player id is
 *  part of the identity so different battlefields count as different
 *  zones. */
type MarqueeStartZone =
  | { zone: 'battlefield'; ownerId: string }
  | { zone: 'hand' }
  | { zone: 'stack' };

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
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    startZone: MarqueeStartZone | null;
  } | null>(null);
  // PlayerBox root — used both to bound the marquee-start (only clicks
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

  // Marquee pointer effect. Follows the pointer while dragging out a
  // selection rect; on release, finalize the selection.
  useEffect(() => {
    if (!marquee) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      // Live update the selection as the marquee expands so cards
      // highlight the moment the rect covers them, and un-highlight the
      // moment it doesn't. `pointerup` just closes the marquee — no need
      // to recompute at the end because we already are.
      if (marquee.startZone) {
        const rect = {
          left: Math.min(marquee.x1, e.clientX),
          right: Math.max(marquee.x1, e.clientX),
          top: Math.min(marquee.y1, e.clientY),
          bottom: Math.max(marquee.y1, e.clientY),
        };
        const { own } = computeMarqueeSelection(
          rect,
          marquee.startZone,
        );
        setSelection(own);
      }
      setMarquee((m) =>
        m ? { ...m, x2: e.clientX, y2: e.clientY } : null,
      );
    };
    const onUp = () => {
      setMarquee(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners re-bind on every `drag`/`marquee` update, picking up fresh handlers
  }, [marquee]);

  // Which zone the given viewport point falls in, or null if none. For
  // battlefield, we scan EVERY player's battlefield globally and return
  // the owner id so each board counts as its own zone. Hand/stack are
  // per-player private and only checked against the viewer's own refs.
  const zoneAtPoint = (x: number, y: number): MarqueeStartZone | null => {
    const bfEls = document.querySelectorAll<HTMLElement>(
      '[data-battlefield-owner]',
    );
    for (const el of bfEls) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return {
          zone: 'battlefield',
          ownerId: el.dataset.battlefieldOwner ?? '',
        };
      }
    }
    const hit = (el: HTMLElement | null) => {
      if (!el) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (hit(handRef.current)) {
      return { zone: 'hand' };
    }
    if (hit(stackRef.current)) {
      return { zone: 'stack' };
    }
    return null;
  };

  // Enumerate card elements intersecting the marquee rect across every
  // zone the marquee could touch, then pick a single zone to select from.
  //
  // Rules:
  //   1. Cards intersecting the rect are grouped by zone. Each
  //      battlefield is a separate zone (keyed by owner).
  //   2. If only one zone has intersecting cards → select those,
  //      regardless of whether that zone matches the start point.
  //   3. If multiple zones have intersecting cards → prefer the start
  //      zone. If the start zone isn't among them, fall back to a fixed
  //      priority (battlefield > hand > stack).
  //
  // This lets a marquee that begins in an empty spot (e.g. stack) still
  // catch cards elsewhere, while preventing accidental mixed selections
  // when the rect straddles two zones that both contain cards.
  const computeMarqueeSelection = (
    rect: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
    startZone: MarqueeStartZone,
  ): { own: Selection | null; foreign: Map<string, Set<string>> } => {
    const disjoint = (r: DOMRect) =>
      r.right < rect.left ||
      r.left > rect.right ||
      r.bottom < rect.top ||
      r.top > rect.bottom;

    // key → { ownerId?, ids }. Keys: "hand", "stack", "battlefield:<id>".
    type Bucket = { ownerId?: string; ids: Set<string> };
    const byZone = new Map<string, Bucket>();
    const addHit = (key: string, id: string, ownerId?: string) => {
      const b = byZone.get(key) ?? { ownerId, ids: new Set<string>() };
      b.ids.add(id);
      byZone.set(key, b);
    };

    const boxEl = boxRef.current;
    if (boxEl) {
      (['hand', 'stack'] as const).forEach((z) => {
        const els = boxEl.querySelectorAll<HTMLElement>(
          `[data-card][data-zone="${z}"]`,
        );
        els.forEach((el) => {
          const id = el.dataset.cardId;
          if (!id) {
            return;
          }
          if (disjoint(el.getBoundingClientRect())) {
            return;
          }
          addHit(z, id);
        });
      });
    }
    const bfEls = document.querySelectorAll<HTMLElement>(
      '[data-battlefield-owner]',
    );
    bfEls.forEach((bfEl) => {
      const ownerId = bfEl.dataset.battlefieldOwner ?? '';
      const key = `battlefield:${ownerId}`;
      const cardEls = bfEl.querySelectorAll<HTMLElement>(
        '[data-card][data-zone="battlefield"]',
      );
      cardEls.forEach((el) => {
        const id = el.dataset.cardId;
        if (!id) {
          return;
        }
        if (disjoint(el.getBoundingClientRect())) {
          return;
        }
        addHit(key, id, ownerId);
      });
    });

    if (byZone.size === 0) {
      return { own: null, foreign: new Map() };
    }

    const startKey =
      startZone.zone === 'battlefield'
        ? `battlefield:${startZone.ownerId}`
        : startZone.zone;
    const rank = (k: string) => {
      if (k.startsWith('battlefield:')) {
        return 0;
      }
      if (k === 'hand') {
        return 1;
      }
      if (k === 'stack') {
        return 2;
      }
      return 3;
    };
    let winnerKey: string;
    if (byZone.size === 1) {
      winnerKey = byZone.keys().next().value as string;
    } else if (byZone.has(startKey)) {
      winnerKey = startKey;
    } else {
      winnerKey = [...byZone.keys()].sort((a, b) => rank(a) - rank(b))[0];
    }

    const winner = byZone.get(winnerKey)!;
    if (winnerKey === 'hand') {
      return { own: { zone: 'hand', ids: winner.ids }, foreign: new Map() };
    }
    if (winnerKey === 'stack') {
      return { own: { zone: 'stack', ids: winner.ids }, foreign: new Map() };
    }
    // Battlefield: own if we own it, foreign otherwise.
    if (winner.ownerId === String(playerId)) {
      return {
        own: { zone: 'battlefield', ids: winner.ids },
        foreign: new Map(),
      };
    }
    return {
      own: null,
      foreign: new Map([[winner.ownerId ?? '', winner.ids]]),
    };
  };

  // PlayerBox root pointerdown: start a marquee when the click landed on
  // background (not on any card/pile). Both viewer + opponent boxes handle
  // this — opponent boxes forward to the viewer's PlayerBox via
  // `onMarqueeStart` so a marquee can begin over any battlefield.
  const onPointerDownBox = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement | null;
    // Card wrappers, library, graveyard, and exile all have their own
    // pointerdown; let them handle it (they'll manage selection state).
    // Also skip clicks that land inside a floating context menu —
    // React events on portal-rendered menus bubble through the React
    // tree back to this PlayerBox, and treating a menu-item click as
    // "clicked empty background" would clear the marquee selection
    // BEFORE the item's click handler fires, causing the item to
    // rebuild against a stale (null) selection.
    if (
      target?.closest('[data-card]') ||
      target?.closest('[data-drag-source]') ||
      target?.closest('[data-card-context-menu]') ||
      target?.closest('[data-context-menu]')
    ) {
      return;
    }
    // Clicks on a scrollbar (e.g. the hand's horizontal scrollbar) fire
    // pointerdown on the scrolling element with the pointer sitting past
    // clientWidth/clientHeight. Those aren't marquee gestures.
    if (target) {
      const rect = target.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const onHScrollbar =
        target.scrollWidth > target.clientWidth &&
        localY > target.clientHeight;
      const onVScrollbar =
        target.scrollHeight > target.clientHeight &&
        localX > target.clientWidth;
      if (onHScrollbar || onVScrollbar) {
        return;
      }
    }
    // Both self and opponent boxes start their own local marquee —
    // each battlefield owns its own selection (Cockatrice parity).
    // Starting one clears the selection on every seat.
    clearAllSelection();
    setMarquee({
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
      startZone: zoneAtPoint(e.clientX, e.clientY),
    });
  };


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
      return { zone: 'hand', index };
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
