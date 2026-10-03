import { useEffect, useMemo, useRef, useState } from 'react';
import { useForkRef } from '@mui/material/utils';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import {
  layoutStackPile,
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
  STACK_PILE_HORIZONTAL_OFFSET_PX,
} from '../../battlefield/Battlefield/battlefieldLayout';
import { applyPTDelta, parsePT } from '../../context-menus/CardContextMenu/cardAttributeEdits';
import {
} from '../../../hooks/dialogs/seatPrompts';
import type {
  BattlefieldCardViewModel,
  PlayerBoardCommands,
  PlayerBoardModel,
  PlayerCardViewModel,
  SeatMoveCard,
  SeatMoveDestination,
} from './playerBoard.types';
import { useCardScale } from '../CardScaleContext';
import { CARD_BACK_URL, CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';
import { type ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import Card from '../SeatCard/SeatCard';
import { usePublishSeatShortcuts, type SeatShortcutOperations } from '../SeatShortcutsContext';
import { useSeatSelection, type SeatSelection } from '../../../hooks/useSeatSelection';
import { useMoveTopUntil } from '../../../hooks/useMoveTopUntil';
import { useGameSelectionState } from '../GameSelectionContext';
import { useCanActFor } from '../CardVisualStateContext';
import { SEAT_DROP_PRIORITY, type SeatZone } from '../../../hooks/seatDropPlan';
import { useActiveSeatDrag, useSeatDragSource, useSeatDropZone, type SeatDragStart } from '../SeatDragContext';
import { useGameDialogActions } from '../GameDialogActionsContext';
import { useGameDialogsContext } from '../GameDialogsContext';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';
import { MANA_COLORS } from '../../right-sidebar/PlayerInfoPanel/manaColors';
import { toRecipient } from './revealRecipient';
import { useHorizontalWheelScroll } from '../../../hooks/useHorizontalWheelScroll';
import { MAX_COUNTER_VALUE } from './counterLimits';
import { useDrawFlights } from './useDrawFlights';
import { usePendingArrows } from './usePendingArrows';
import { useSeatCardMetadata } from './useSeatCardMetadata';
import { useSeatPrompts } from './useSeatPrompts';
import { usePileMenus } from '../ZoneStack/usePileMenus';

/** Seat card shapes. Owned by the PlayerBoard seat contract; the aliases keep
 *  this façade's local names until its regions move to PlayerBoard. */
type HandCard = PlayerCardViewModel;
type BattlefieldCard = BattlefieldCardViewModel;

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
  // Dialog-opening actions surfaced by the game-level provider. Used
  // by the battlefield right-click menu to fire the same Roll die /
  // Game info flows the sidebar buttons already trigger.
  const {
    onRequestRollDie,
    onRequestGameInfo,
    onRequestViewSideboard,
  } = useGameDialogActions();
  // The seat's zone views (library, top / bottom N, graveyard, exile,
  // hand, sideboard) are game dialogs: openZoneView stacks one and dumps a
  // hidden zone. Hand-menu handlers already wired at the dialog layer:
  // `handleRequestSortHandBy` fires per-card moveCard dispatches
  // (hand_menu.cpp parity), `handleRequestChooseMulligan` opens a numeric
  // prompt then dispatches Command_Mulligan.
  const {
    openZoneView,
    openMoveTopUntil,
    handleRequestSortHandBy,
    handleRequestChooseMulligan,
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
  const [stackSize, setStackSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stackRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      setStackSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  // Whether the hand row is being hovered — controls the auto-expand
  // that reveals full-size cards over the play area without reflowing
  // the shell (same pattern the PhaseTrack uses on the left edge).
  const [handExpanded, setHandExpanded] = useState(false);
  // Tracks whether the hand's slide tween is mid-flight. Combined with
  // `handExpanded` to keep the outer wrapper's `overflow-visible` on
  // until the return-to-idle animation actually finishes — otherwise
  // the wrapper clips its own cards mid-slide when hover ends.
  const [handAnimating, setHandAnimating] = useState(false);
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

  // Seat-scoped shortcut operations. useGameShortcuts owns the key bindings
  // and runs these for the local seat only (see SeatShortcutsContext).
  const seatShortcuts: SeatShortcutOperations = {};

  // Desktop aMulligan (Ctrl+M) prompts for the hand size instead of assuming
  // seven; aSet (Ctrl+L) opens the set-life prompt; aRemoveLocalArrows
  // (Ctrl+R) deletes every arrow this player drew, one Command_DeleteArrow
  // each, and never touches other players' arrows.
  seatShortcuts['game.mulligan'] = () => handleRequestChooseMulligan();
  seatShortcuts['game.setLife'] = () => openLifePrompt();
  seatShortcuts['game.removeLocalArrows'] = () => targetCommands.clearOwnArrows();

  // Cockatrice-parity Toggle Skip Untapping (Alt+U). Acts on the
  // local marquee `selection` (same state the right-click menu reads
  // via `targetIds`). Uses the first selected card as the "clicked card"
  // to drive the target value, matching the menu's behavior for a
  // mixed selection (all cards land in the same doesntUntap state).
  seatShortcuts['game.doesntUntap'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const target = !selectedCards[0].doesntUntap;
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      cardCommands.setDoesntUntap(id, target);
    }
  };

  // Put top cards on stack until… (Ctrl+Shift+Y). Opens the dialog.
  seatShortcuts['game.moveTopUntil'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openMoveTopUntilDialog();
  };

  // Deck-flip toggles (Ctrl+Alt+N / Ctrl+Alt+Shift+N). Cockatrice
  // defaults collide with Chromium's new-window / new-incognito, so
  // we rebind. Toggles the corresponding zone property.
  seatShortcuts['game.alwaysRevealTopCard'] = () => {
    if (!isSelf) {
      return;
    }
    zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard);
  };
  seatShortcuts['game.alwaysLookAtTopCard'] = () => {
    if (!isSelf) {
      return;
    }
    zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard);
  };

  // View top/bottom cards of library (Ctrl+Alt+W / Ctrl+Alt+Shift+W).
  // Rebound from Ctrl+W / Ctrl+Shift+W (browser close-tab / close-window).
  seatShortcuts['game.viewTopCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openViewLibraryCountPrompt({ isReversed: false, deckSize: deckCount });
  };
  seatShortcuts['game.viewBottomCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    openViewLibraryCountPrompt({ isReversed: true, deckSize: deckCount });
  };

  // Create token (Ctrl+K, rebound from Cockatrice's Ctrl+T).
  seatShortcuts['game.createToken'] = () => {
    if (!isSelf) {
      return;
    }
    openCreateTokenDialog();
  };

  // Create another token (Ctrl+G) — re-fires the last submitted token.
  seatShortcuts['game.createAnotherToken'] = () => {
    if (!isSelf || !lastToken) {
      return;
    }
    cardCommands.createToken(lastToken);
  };

  // Draw Arrow (Alt+A). Same shape as Attach: first selected card
  // becomes the source, next battlefield click resolves.
  seatShortcuts['game.drawArrow'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const source = battlefieldDisplayList.find((bc) => selection.ids.has(bc.id));
    if (!source) {
      return;
    }
    const sourceCardId = Number(source.id);
    if (!Number.isFinite(sourceCardId)) {
      return;
    }
    setDrawArrowPending({
      sourceCardId,
      sourceCardName: source.name,
      sourceZone: ZoneName.TABLE,
    });
  };

  // Reset Power/Toughness (Ctrl+Alt+0). Same per-card logic as the
  // menu path at line ~10036: face-down → empty PT, face-up →
  // Scryfall printed base. Skips cards already at their reset value.
  seatShortcuts['game.resetPT'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; pt: string }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const base = bc.faceDown ? '' : cardMetaByName.get(bc.name)?.pt ?? '';
      if (base !== (bc.pt ?? '')) {
        entries.push({ cardId: bcId, pt: base });
      }
    }
    if (entries.length > 0) {
      cardCommands.setPT(entries);
    }
  };

  // Reduce Life by Power (Ctrl+Shift+L). Sums the server-set power
  // of every selected battlefield card and subtracts from local
  // player's life. Mirrors the menu path at line ~10093.
  seatShortcuts['game.reduceLifeByPower'] = () => {
    if (!isSelf || !lifeControl || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    let total = 0;
    for (const bc of targets) {
      if (!bc.pt) {
        continue;
      }
      const tokens = parsePT(bc.pt);
      if (tokens.length === 0) {
        continue;
      }
      const first = tokens[0];
      const power = typeof first === 'number' ? first : parseInt(first, 10);
      if (Number.isFinite(power)) {
        total += Math.max(power, 0);
      }
    }
    if (total > 0) {
      lifeControl.onDelta(-total);
    }
  };

  // Storm ("Other") player counter shortcuts (Ctrl+] / Ctrl+[ / Ctrl+\).
  // Player-scoped, unlike the per-card counter shortcuts above.
  // Storm's server-assigned counterId lives on manaCounters.O — no-op
  // until Redux has hydrated the mana pool.
  seatShortcuts['game.addStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    counterCommands.increment(manaCounters.O.id, 1);
  };
  seatShortcuts['game.removeStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    counterCommands.increment(manaCounters.O.id, -1);
  };
  seatShortcuts['game.setStormCounter'] = () => {
    if (!isSelf || !manaCounters?.O) {
      return;
    }
    openCounterPrompt({
      counterId: manaCounters.O.id,
      label: 'Other',
      currentValue: manaCounters.O.count,
    });
  };

  // Attach Card (Ctrl+Alt+A). Starts the pending attach-arrow flow.
  // Cockatrice attaches every selected card to the target on
  // completion — the first selected card drives the visual anchor
  // (arrow origin + green ring), the rest ride along via
  // `attachExtraSourceIds`. Escape or clicking any source cancels.
  seatShortcuts['game.attachCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const sources = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => ({ id: Number(bc.id), name: bc.name }))
      .filter((s) => Number.isFinite(s.id));
    if (sources.length === 0) {
      return;
    }
    const [primary, ...extras] = sources;
    setAttachPending({ sourceCardId: primary.id, sourceCardName: primary.name });
    setAttachExtraSourceIds(extras.map((s) => s.id));
  };

  // Peek Card (Alt+L). Reveals face-down battlefield cards in the
  // selection to the local player only. Mirrors the "Peek card" menu
  // item — filters to face-down cards so face-up ones in a mixed
  // selection aren't wire-noise. No-op with an empty selection or
  // when no selected card is face-down.
  seatShortcuts['game.peekCard'] = () => {
    if (!isSelf || !cardCommands.peek || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const ids = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id) && bc.faceDown)
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return;
    }
    cardCommands.peek(ids);
  };

  // Turn Card Over (Alt+F). Same shape as doesntUntap above: read the
  // local marquee selection, use the first card's current faceDown to
  // drive the target, then fire cardCommands.flip per card. Matches the
  // right-click "Flip card" menu item at line ~9011.
  seatShortcuts['game.flipCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const target = !selectedCards[0].faceDown;
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      cardCommands.flip(id, target);
    }
  };

  // Unattach (Ctrl+Alt+U). Fires per-card unattach on the selection;
  // matches the "Unattach" menu item at line ~9295. Server no-ops on
  // non-attached cards so we don't pre-filter.
  seatShortcuts['game.unattachCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    for (const bc of selectedCards) {
      const id = Number(bc.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      targetCommands.unattach(id);
    }
  };

  // Move selection → Graveyard (Ctrl+Del). Single batched
  // Command_MoveCard with cards_to_move for every selected card,
  // matching the "Send to Graveyard" menu path via dispatchMove.
  seatShortcuts['game.moveSelectedToGrave'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.GRAVE, reversed: false });
  };

  // Set Power/Toughness (Ctrl+P). Opens the PT modal against the
  // selection. First-selected card drives cardName / current-PT for
  // the modal label + prefill, matching the menu path at line ~9287
  // (which uses the right-clicked card for the same purpose).
  seatShortcuts['game.setCardPT'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const targetIds = selectedCards
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = selectedCards[0];
    const current = first.pt || (cardMetaByName.get(first.name)?.pt ?? '');
    openPTPrompt({ targetIds, cardName: first.name, current });
  };

  // Shared helper for the P/T delta shortcuts (Ctrl/Alt/Ctrl+Alt with
  // `+`/`-`). Same per-card logic as the menu's dispatchPTDelta at
  // line ~9110: each card computes its OWN new PT from its OWN current
  // server PT (falling back to Scryfall base, then '0/0' for empties),
  // so a mixed selection doesn't get truncated to one card's stats.
  const dispatchPTDeltaForSelection = (dp: number, dt: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const entries: { cardId: number; pt: string }[] = [];
    for (const bc of selectedCards) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const bcCurrent = bc.pt || (cardMetaByName.get(bc.name)?.pt ?? '');
      const base = bcCurrent || '0/0';
      entries.push({ cardId: bcId, pt: applyPTDelta(base, dp, dt) });
    }
    if (entries.length > 0) {
      cardCommands.setPT(entries);
    }
  };

  seatShortcuts['game.incP'] = () => dispatchPTDeltaForSelection(1, 0);
  seatShortcuts['game.decP'] = () => dispatchPTDeltaForSelection(-1, 0);
  seatShortcuts['game.incT'] = () => dispatchPTDeltaForSelection(0, 1);
  seatShortcuts['game.decT'] = () => dispatchPTDeltaForSelection(0, -1);
  seatShortcuts['game.incPT'] = () => dispatchPTDeltaForSelection(1, 1);
  seatShortcuts['game.decPT'] = () => dispatchPTDeltaForSelection(-1, -1);

  // Select All (Ctrl+A) — mirrors the "Select All" battlefield-menu
  // item at line ~8910: sets the local marquee selection to every
  // battlefield card. First-pass simplification of Cockatrice's
  // mouse-under-zone semantics (own battlefield only).
  seatShortcuts['game.selectAllBattlefield'] = () => {
    if (!isSelf) {
      return;
    }
    const ids = new Set(battlefieldDisplayList.map((bc) => bc.id));
    if (ids.size === 0) {
      return;
    }
    setSelection({ zone: 'battlefield', ids });
  };

  // Select Row / Column (Ctrl+Shift+X / Ctrl+Shift+C). First card in
  // the current selection is the anchor; expand to every battlefield
  // card matching its slot.row or slot.col. Mirrors onSelectRow at
  // line ~9507 (the menu path uses the right-clicked card as anchor).
  const selectBattlefieldBySlotField = (field: 'row' | 'col') => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const anchor = battlefieldDisplayList.find((bc) => selection.ids.has(bc.id));
    if (!anchor) {
      return;
    }
    const anchorValue = anchor.slot[field];
    const ids = new Set(
      battlefieldDisplayList
        .filter((bc) => bc.slot[field] === anchorValue)
        .map((bc) => bc.id),
    );
    if (ids.size === 0) {
      return;
    }
    setSelection({ zone: 'battlefield', ids });
  };

  seatShortcuts['game.selectRowBattlefield'] = () => selectBattlefieldBySlotField('row');
  seatShortcuts['game.selectColumnBattlefield'] = () => selectBattlefieldBySlotField('col');

  // Card-counter shortcuts. Cockatrice ships Add / Remove / Set for
  // three default counter types (A red = 0, B yellow = 1, C green = 2).
  // All three helpers operate on the current battlefield selection
  // (no-op when empty). Add / Remove drive `counterCommands.setCardCounters`
  // with per-card cur ± 1 (clamped to [0, MAX_COUNTER_VALUE]); Set
  // opens the same modal the card-menu Set item uses (line ~9630),
  // anchored on the first selected card for name / counterLetter /
  // currentValue prefill.
  const addCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const cur = bc.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
      if (cur >= MAX_COUNTER_VALUE) {
        continue;
      }
      entries.push({ cardId: bcId, counterId, value: cur + 1 });
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  const removeCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const bc of targets) {
      const bcId = Number(bc.id);
      if (!Number.isFinite(bcId)) {
        continue;
      }
      const cur = bc.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
      if (cur <= 0) {
        continue;
      }
      entries.push({ cardId: bcId, counterId, value: cur - 1 });
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  const openCardCounterPromptForSelection = (counterId: number) => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targets = battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id));
    if (targets.length === 0) {
      return;
    }
    const targetIds = targets.map((bc) => Number(bc.id)).filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = targets[0];
    const currentValue = first.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
    openCardCounterPrompt({ targetIds, cardName: first.name, counterId, currentValue });
  };

  seatShortcuts['game.addCounterA'] = () => addCardCounterOnSelection(0);
  seatShortcuts['game.removeCounterA'] = () => removeCardCounterOnSelection(0);
  seatShortcuts['game.setCounterA'] = () => openCardCounterPromptForSelection(0);
  seatShortcuts['game.addCounterB'] = () => addCardCounterOnSelection(1);
  seatShortcuts['game.removeCounterB'] = () => removeCardCounterOnSelection(1);
  seatShortcuts['game.setCounterB'] = () => openCardCounterPromptForSelection(1);
  seatShortcuts['game.addCounterC'] = () => addCardCounterOnSelection(2);
  seatShortcuts['game.removeCounterC'] = () => removeCardCounterOnSelection(2);
  seatShortcuts['game.setCounterC'] = () => openCardCounterPromptForSelection(2);

  // Increment all card counters (Ctrl+Shift+A). Ports the utility-menu
  // handler at line ~6377: selection ∩ battlefield if any, else full
  // battlefield; for each targeted card, bump every EXISTING counter
  // by +1 (skips counters already at MAX_COUNTER_VALUE). Silently
  // no-ops cards without counters — matches Cockatrice desktop, which
  // only touches counters that already exist.
  seatShortcuts['game.incrementAllCardCounters'] = () => {
    if (!isSelf) {
      return;
    }
    const targets =
      selection?.zone === 'battlefield' && selection.ids.size > 0
        ? battlefieldDisplayList.filter((c) => selection.ids.has(c.id))
        : battlefieldDisplayList;
    const entries: { cardId: number; counterId: number; value: number }[] = [];
    for (const card of targets) {
      const cardIdNum = Number(card.id);
      if (!Number.isFinite(cardIdNum)) {
        continue;
      }
      for (const counter of card.counters ?? []) {
        if (counter.value >= MAX_COUNTER_VALUE) {
          continue;
        }
        entries.push({ cardId: cardIdNum, counterId: counter.id, value: counter.value + 1 });
      }
    }
    if (entries.length > 0) {
      counterCommands.setCardCounters(entries);
    }
  };

  // Set Annotation (Alt+N). Same shape as Set Power/Toughness above:
  // open the annotation modal against the selection with the first
  // card's name + current annotation for the label / prefill.
  seatShortcuts['game.setAnnotation'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    const targetIds = selectedCards
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    const first = selectedCards[0];
    openAnnotationPrompt({ targetIds, cardName: first.name, current: first.annotation ?? '' });
  };

  // Move selection → Bottom of Library (Ctrl+B). Same shape as
  // moveSelectedToGrave; targetZone=DECK with isReversed=true is the
  // "bottom" idiom (matches PlayerBox onMoveToBottom at line ~9157).
  seatShortcuts['game.moveSelectedToLibraryBottom'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.DECK, reversed: true });
  };

  // Clone Card (Ctrl+J). Fires one Command_CreateToken per selected
  // card via cardCommands.clone, preserving each card's own name / provider /
  // color / pt / annotation / row. Matches the "Clone" menu item at
  // line ~9085 exactly (including the optimistic-mock skip).
  seatShortcuts['game.cloneCard'] = () => {
    if (!isSelf || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const selectedCards = battlefieldDisplayList.filter((bc) =>
      selection.ids.has(bc.id),
    );
    if (selectedCards.length === 0) {
      return;
    }
    for (const bc of selectedCards) {
      if (!Number.isFinite(Number(bc.id))) {
        continue;
      }
      cardCommands.clone({
        name: bc.name,
        providerId: bc.scryfallId,
        color: bc.color ?? '',
        pt: bc.pt ?? '',
        annotation: bc.annotation ?? '',
        y: bc.slot.row,
      });
    }
  };

  usePublishSeatShortcuts(isSelf ? seatShortcuts : null);


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
  // Mana pool: read from the wired `manaCounters` when available
  // (Redux-authoritative), fall back to zeros during pre-hydration.
  // Local mana pool is per-player and matches Cockatrice's
  // Servatrice-created counters (w/u/b/r/g/x/storm) — see
  // server_player.cpp:96-102.
  const manaPool: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O', number> = {
    W: manaCounters?.W?.count ?? 0,
    U: manaCounters?.U?.count ?? 0,
    B: manaCounters?.B?.count ?? 0,
    R: manaCounters?.R?.count ?? 0,
    G: manaCounters?.G?.count ?? 0,
    C: manaCounters?.C?.count ?? 0,
    O: manaCounters?.O?.count ?? 0,
  };

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
  const graveyardTopIdx =
    graveDisplayList.length - 1 - (seatDrag?.zone === 'graveyard' ? 1 : 0);
  const exileTopIdx =
    exileDisplayList.length - 1 - (seatDrag?.zone === 'exile' ? 1 : 0);
  const graveyardTop =
    graveyardTopIdx >= 0 ? graveDisplayList[graveyardTopIdx] : null;
  const exileTop = exileTopIdx >= 0 ? exileDisplayList[exileTopIdx] : null;

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
  // Library menu items — ported 1:1 from Cockatrice's LibraryMenu.
  // Cockatrice attaches the SAME LibraryMenu instance to both the
  // library pile and the battlefield PlayerMenu (player_menu.cpp:23,67),
  // so the two entry points share this const.
  //
  // Helper: single-card "Top of library..." → target move click. Wire
  // uses cardId=0 (cmdSetTopCard, player_actions.cpp:376).
  const buildMoveTopCardTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ): (() => void) => () => {
    if (deckCount <= 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.DECK, [faceDown ? { id: 0, faceDown: true } : 0], { zone: targetZone, index });
  };
  // Single-card "Bottom of library..." → target move click. Wire uses
  // cardId=deckCount-1 (cmdSetBottomCard, player_actions.cpp:384).
  const buildMoveBottomCardTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ): (() => void) => () => {
    if (deckCount <= 0) {
      return;
    }
    const id = deckCount - 1;
    zoneCommands.moveCards(ZoneName.DECK, [faceDown ? { id, faceDown: true } : id], { zone: targetZone, index });
  };
  // Multi-card "Move top N to <target>" prompt. Iterates i in
  // [N-1..0] to match moveTopCardsTo iteration order (player_actions.cpp:475).
  const promptMoveTopNTo = (
    title: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ): (() => void) => () => {
    const size = deckCount;
    if (size <= 0) {
      return;
    }
    openCountPrompt({
      title,
      submitLabel: 'Move',
      deckSize: size,
      onSubmit: (n) => {
        const count = Math.min(n, size);
        if (count <= 0) {
          return;
        }
        const cards: SeatMoveCard[] = [];
        for (let i = count - 1; i >= 0; i--) {
          cards.push(faceDown ? { id: i, faceDown: true } : i);
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: targetZone });
      },
    });
  };
  // Multi-card "Move bottom N to <target>" prompt. Iterates i in
  // [maxCards-N..maxCards-1] to match moveBottomCardsTo iteration
  // order (player_actions.cpp:673) and actDrawBottomCards (:798).
  const promptMoveBottomNTo = (
    title: string,
    submitLabel: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ): (() => void) => () => {
    const size = deckCount;
    if (size <= 0) {
      return;
    }
    openCountPrompt({
      title,
      submitLabel,
      deckSize: size,
      onSubmit: (n) => {
        const count = Math.min(n, size);
        if (count <= 0) {
          return;
        }
        const cards: SeatMoveCard[] = [];
        for (let i = size - count; i < size; i++) {
          cards.push(faceDown ? { id: i, faceDown: true } : i);
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: targetZone });
      },
    });
  };
  // Reveal targets → submenu builder for "Reveal library to..." and
  // "Reveal top cards to...". Reveal-library variant includes an "All
  // players" option; reveal-top-N variant opens a numeric prompt per
  // pick. Lend-library variant omits "All players" (library_menu.cpp:280-293).
  const revealLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        { label: 'All players', onClick: () => zoneCommands.reveal(ZoneName.DECK, toRecipient(-1)) },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => zoneCommands.reveal(ZoneName.DECK, toRecipient(t.playerId)),
        })),
      ]
      : [{ label: '(no players)' }];
  const lendLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? revealTargets.map((t) => ({
        label: t.name,
        onClick: () => zoneCommands.lendLibrary(t.playerId),
      }))
      : [{ label: '(no players)' }];
  const revealTopCardsItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () =>
            openRevealTopCardsPrompt({
              targetPlayerId: -1,
              targetName: 'all players',
              deckSize: deckCount,
            }),
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () =>
            openRevealTopCardsPrompt({
              targetPlayerId: t.playerId,
              targetName: t.name,
              deckSize: deckCount,
            }),
        })),
      ]
      : [{ label: '(no players)' }];
  const libraryMenuItems: ContextMenuItem[] = [
    {
      label: 'Draw card',
      onClick: () => draw(1),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawCard'],
    },
    {
      label: 'Draw cards...',
      onClick: () => openDrawCardsPrompt({ deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawMultipleCards'],
    },
    {
      label: 'Undo last draw',
      onClick: () => zoneCommands.undoDraw(),
      // Cockatrice always shows this enabled; server rejects when
      // nothing to undo.
      shortcut: shortcutHints['game.undoDraw'],
    },
    { divider: true },
    {
      label: 'Shuffle',
      onClick: () => zoneCommands.shuffleLibrary(),
      disabled: deckCount <= 1,
      shortcut: shortcutHints['game.shuffleLibrary'],
    },
    { divider: true },
    {
      label: 'View library',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewLibrary'],
    },
    {
      label: 'View top cards of library...',
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: false, deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewTopCards'],
    },
    {
      label: 'View bottom cards of library...',
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: true, deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewBottomCards'],
    },
    { divider: true },
    { label: 'Reveal library to...', submenu: revealLibraryItems },
    { label: 'Lend library to...', submenu: lendLibraryItems },
    { label: 'Reveal top cards to...', submenu: revealTopCardsItems },
    {
      label: 'Always reveal top card',
      checked: alwaysRevealTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard),
      shortcut: shortcutHints['game.alwaysRevealTopCard'],
    },
    {
      label: 'Always look at top card',
      checked: alwaysLookAtTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard),
      shortcut: shortcutHints['game.alwaysLookAtTopCard'],
    },
    { divider: true },
    {
      label: 'Top of library...',
      disabled: deckCount <= 0,
      submenu: [
        {
          label: 'Play top card',
          onClick: buildMoveTopCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.playTop'],
        },
        {
          label: 'Play top card face down',
          onClick: buildMoveTopCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: 'Put top card on bottom',
          onClick: buildMoveTopCardTo(ZoneName.DECK, 'end'),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Move top card to graveyard',
          onClick: buildMoveTopCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopToGrave'],
        },
        {
          label: 'Move top cards to graveyard...',
          onClick: promptMoveTopNTo('Move top cards to graveyard', ZoneName.GRAVE),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopNToGrave'],
        },
        {
          label: 'Move top cards to graveyard face down...',
          onClick: promptMoveTopNTo(
            'Move top cards to graveyard face down',
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top card to exile',
          onClick: buildMoveTopCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top cards to exile...',
          onClick: promptMoveTopNTo('Move top cards to exile', ZoneName.EXILE),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top cards to exile face down...',
          onClick: promptMoveTopNTo(
            'Move top cards to exile face down',
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Put top cards on stack until…',
          onClick: openMoveTopUntilDialog,
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopUntil'],
        },
        { divider: true },
        {
          label: 'Shuffle top cards...',
          onClick: () => {
            const size = deckCount;
            if (size <= 0) {
              return;
            }
            openCountPrompt({
              title: 'Shuffle top cards',
              submitLabel: 'Shuffle',
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // Command_Shuffle range is inclusive: [0, N-1] shuffles
                // positions 0..N-1 (player_actions.cpp:267-268).
                zoneCommands.shuffleLibrary({ start: 0, end: count - 1 });
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    {
      label: 'Bottom of library...',
      disabled: deckCount <= 0,
      submenu: [
        {
          label: 'Draw bottom card',
          onClick: buildMoveBottomCardTo(ZoneName.HAND, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Draw bottom cards...',
          onClick: promptMoveBottomNTo(
            'Draw bottom cards',
            'Draw',
            ZoneName.HAND,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Play bottom card',
          onClick: buildMoveBottomCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
        },
        {
          label: 'Play bottom card face down',
          onClick: buildMoveBottomCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: 'Put bottom card on top',
          onClick: buildMoveBottomCardTo(ZoneName.DECK, 0),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Move bottom card to graveyard',
          onClick: buildMoveBottomCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to graveyard...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to graveyard',
            'Move',
            ZoneName.GRAVE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to graveyard face down...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to graveyard face down',
            'Move',
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom card to exile',
          onClick: buildMoveBottomCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to exile...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to exile',
            'Move',
            ZoneName.EXILE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to exile face down...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to exile face down',
            'Move',
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Shuffle bottom cards...',
          onClick: () => {
            const size = deckCount;
            if (size <= 0) {
              return;
            }
            openCountPrompt({
              title: 'Shuffle bottom cards',
              submitLabel: 'Shuffle',
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // `[-N, -1]` — negative indices count from the end
                // (server accepts either sign; Cockatrice desktop
                // always sends negative for bottom, :298-299).
                zoneCommands.shuffleLibrary({ start: -count, end: -1 });
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    { divider: true },
    {
      // Webatrice divergence: instead of reconstructing the deck
      // in-app, we route to the same `/deck/:id` page a My Decks
      // row-click opens. Disabled when the game's deck doesn't
      // match any of the user's saved decks (name-based lookup
      // happens in GameBoardCell).
      label: 'Open deck in deck editor',
      onClick: onOpenDeckInEditor,
      disabled: !onOpenDeckInEditor,
    },
  ];

  // Battlefield right-click menu — Cockatrice's PlayerMenu (attached
  // to the TableZoneGraphicsItem, player_menu.cpp:60-62). Shape
  // matches 1:1 with the desktop menu. Pile submenus (Hand, Library,
  // Graveyard, Exile, Sideboard) already have their own right-click
  // menus on their piles; here we surface a single hint item pointing
  // there instead of duplicating hundreds of lines of already-wired
  // items. Utility actions we don't yet wire (untap-all, flip-coin,
  // create-token, counters, custom-zones) render disabled so the shape
  // still reads as identical to Cockatrice. Gated to isSelf per
  // player_menu.cpp — spectators / opponents don't get this menu.
  // Prefer the server-broadcast count from `zoneCounts.hand`, which
  // is populated for BOTH self and opponents (HAND is a PrivateZone
  // but its cardCount is public). Falling back to `zones.hand.cards.length`
  // as second choice would silently return 0 for opponents — their
  // zones.hand.cards array is always empty because they don't ship the card
  // identities to us — so nullish-coalescing to it would leave the
  // badge stuck at 0.
  const handSize = zones.hand.cardCount ?? zones.hand.cards.length;
  // Reveal-hand submenu — same shape as reveal-library (All players
  // + separator + one entry per opponent). Uses the same wire as
  // reveal-library (Command_RevealCards with zoneName=hand). No
  // playerId when targeting "All players" (-1) — proto2 field
  // presence trap; server returns RespNameNotFound if we sent -1
  // explicitly. Kept inline here since it's tiny.
  const revealHandSubmenu: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () => zoneCommands.reveal(ZoneName.HAND, toRecipient(-1)),
          disabled: handSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => zoneCommands.reveal(ZoneName.HAND, toRecipient(t.playerId)),
          disabled: handSize <= 0,
        })),
      ]
      : [{ label: '(no players)' }];
  const revealRandomHandSubmenu: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () => zoneCommands.reveal(ZoneName.HAND, toRecipient(-1), 'random'),
          disabled: handSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () =>
            zoneCommands.reveal(ZoneName.HAND, toRecipient(t.playerId), 'random'),
          disabled: handSize <= 0,
        })),
      ]
      : [{ label: '(no players)' }];
  // Helper: build a "move all cards from HAND to <target>" click
  // handler. Hand card ids are real numeric ids on the wire.
  const moveAllHandTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
  ): (() => void) => () => {
    if (zones.hand.cards.length === 0) {
      return;
    }
    const cardIds = zones.hand.cards.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.HAND, cardIds, { zone: targetZone, index });
  };
  const handMenuItems: ContextMenuItem[] = [
    {
      // View hand — the same zone view as View library /
      // graveyard / exile (desktop aViewHand). Only offered
      // for the local player; opponents' hands are hidden and the
      // dialog would have nothing to show.
      label: 'View hand',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.HAND }),
      disabled: !isSelf || handSize <= 0,
    },
    {
      // Sort hand by ... — dispatches per-card moveCard reorders
      // in the calculated order. Matches Cockatrice's
      // hand_menu.cpp; async lookup for maintype / manacost keys.
      label: 'Sort hand by...',
      submenu: [
        {
          label: 'Name',
          onClick: () => handleRequestSortHandBy('name'),
          disabled: !isSelf || handSize <= 1,
        },
        {
          label: 'Type',
          onClick: () => handleRequestSortHandBy('maintype'),
          disabled: !isSelf || handSize <= 1,
          shortcut: shortcutHints['game.sortHandByType'],
        },
        {
          label: 'Mana Value',
          onClick: () => handleRequestSortHandBy('manacost'),
          disabled: !isSelf || handSize <= 1,
        },
      ],
    },
    {
      label: 'Reveal hand to...',
      submenu: revealHandSubmenu,
    },
    {
      label: 'Reveal random card to...',
      submenu: revealRandomHandSubmenu,
    },
    { divider: true },
    {
      // Opens a numeric prompt (dialog layer), then fires
      // Command_Mulligan with the resolved hand size. Accepts
      // -handSize..handSize+deckSize (≤0 is relative — desktop
      // parity, see handleRequestChooseMulligan in useGameDialogs).
      label: 'Take mulligan (Choose hand size)',
      onClick: () => handleRequestChooseMulligan(),
      disabled: !isSelf,
    },
    {
      label: 'Take mulligan (Same hand size)',
      onClick: () => zoneCommands.mulligan(handSize),
      disabled: handSize <= 0,
      shortcut: shortcutHints['game.mulliganSameSize'],
    },
    {
      label: 'Take mulligan (Hand size - 1)',
      onClick: () => zoneCommands.mulligan(Math.max(1, handSize - 1)),
      disabled: handSize <= 1,
      shortcut: shortcutHints['game.mulliganMinusOne'],
    },
    { divider: true },
    {
      label: 'Move hand to...',
      disabled: handSize <= 0,
      submenu: [
        {
          label: 'Top of library',
          onClick: moveAllHandTo(ZoneName.DECK, 0),
          disabled: handSize <= 0,
        },
        {
          label: 'Bottom of library',
          onClick: moveAllHandTo(ZoneName.DECK, 'end'),
          disabled: handSize <= 0,
        },
        { divider: true },
        {
          label: 'Graveyard',
          onClick: moveAllHandTo(ZoneName.GRAVE, 0),
          disabled: handSize <= 0,
        },
        { divider: true },
        {
          label: 'Exile',
          onClick: moveAllHandTo(ZoneName.EXILE, 0),
          disabled: handSize <= 0,
        },
      ],
    },
  ];
  // Counters submenu — Cockatrice's AbstractCounter builds a menu per
  // counter with "Set counter..." + ±1..±10 rows (abstract_counter.cpp:36-57).
  // We already have all the wires for these: `lifeControl.onDelta` /
  // `.onSet` for life, and `counterCommands.increment(id, delta)` for the mana
  // pool. Just build the delta list programmatically and hand it to
  // each counter's submenu. "Set counter..." on Life reuses the
  // existing Ctrl+L modal; mana counters don't have a set-modal yet
  // so their Set row is disabled.
  const buildDeltaItems = (
    apply: (delta: number) => void,
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // +10 down to +1
    for (let i = 10; i >= 1; i--) {
      items.push({ label: `+${i}`, onClick: () => apply(i) });
    }
    items.push({ divider: true });
    // -1 down to -10
    for (let i = 1; i <= 10; i++) {
      items.push({ label: `-${i}`, onClick: () => apply(-i) });
    }
    return items;
  };
  const lifeCounterItems: ContextMenuItem[] = [
    {
      label: 'Set counter...',
      onClick: () => openLifePrompt(),
      disabled: !lifeControl,
    },
    { divider: true },
    ...buildDeltaItems((d) => lifeControl?.onDelta(d)),
  ];
  const manaCounterSubmenus: ContextMenuItem[] = MANA_COLORS.map((m) => {
    const counter = manaCounters?.[m.symbol];
    const canModify = counter != null;
    const canSet = counter != null;
    return {
      label: m.label,
      // Disable the whole counter's submenu when we don't have a
      // counter id from Redux (pre-hydration transient) — every row
      // inside would no-op anyway.
      disabled: !canModify,
      submenu: [
        {
          // The same sum prompt Ctrl+L opens, titled with the
          // counter name. Fires Command_SetCounter with the
          // absolute value.
          label: 'Set counter...',
          onClick: () => {
            if (counter) {
              openCounterPrompt({
                counterId: counter.id,
                label: m.label,
                currentValue: counter.count,
              });
            }
          },
          disabled: !canSet,
        },
        { divider: true },
        ...buildDeltaItems((d) => {
          if (canModify) {
            counterCommands.increment(counter.id, d);
          }
        }),
      ],
    };
  });
  const countersMenuItems: ContextMenuItem[] = [
    { label: 'Life', submenu: lifeCounterItems },
    ...manaCounterSubmenus,
  ];

  // Rest of the battlefield menu — pile submenus are placeholders
  // (already wired on the piles themselves), utility items wire
  // Roll die and Game info via GameDialogActionsContext. Everything
  // else stays disabled with the correct label so the menu reads
  // identical in shape to Cockatrice's PlayerMenu.
  const battlefieldMenuItems: ContextMenuItem[] = [
    {
      label: 'Hand',
      submenu: handMenuItems,
    },
    {
      // Same items as right-clicking the library pile. Cockatrice's
      // PlayerMenu attaches the same LibraryMenu to both places
      // (player_menu.cpp:23,67).
      label: 'Library',
      submenu: libraryMenuItems,
    },
    {
      // Same items as right-clicking the graveyard pile. Cockatrice's
      // PlayerMenu attaches the same GraveyardMenu to both places
      // (player_menu.cpp:29,63). Top-level entry stays enabled even
      // when the pile is empty so the user can still open "View
      // graveyard" — individual submenu items handle their own
      // per-pile-count disabling.
      label: 'Graveyard',
      submenu: graveMenuItemsSelf,
    },
    {
      // Same items as right-clicking the exile pile. Cockatrice's
      // PlayerMenu attaches the same RfgMenu to both places
      // (player_menu.cpp:30,64).
      label: 'Exile',
      submenu: exileMenuItemsSelf,
    },
    {
      label: 'Sideboard',
      submenu: [
        {
          // Cockatrice's actViewSideboard opens the same zone-view
          // dialog that "View library" opens (player_actions.cpp:232-234).
          label: 'View sideboard',
          onClick: onRequestViewSideboard,
          shortcut: shortcutHints['game.viewSideboard'],
        },
      ],
    },
    { divider: true },
    {
      // Counters submenu — Cockatrice's countersMenu lists every
      // per-player counter (life + w/u/b/r/g/x/storm) as its own
      // ±N/Set submenu (AbstractCounter, abstract_counter.cpp:36-57).
      // We already wire the deltas via lifeControl.onDelta and
      // counterCommands.increment, and life's Set via the Ctrl+L modal.
      label: 'Counters',
      submenu: countersMenuItems,
    },
    {
      // "Increment all card counters" — port of Cockatrice's
      // actIncrementAllCardCounters (player_actions.cpp:1588-1621).
      // Target set: current battlefield selection if any, else every
      // card on this player's battlefield. For each targeted card,
      // iterate its EXISTING counters and bump each by +1, skipping
      // any already at MAX_COUNTER_VALUE (999). Cards with no counters
      // are silently no-ops — matches desktop, which only touches
      // counters that already exist rather than adding new ones.
      // Disabled when no callback is wired (pre-hydration transient)
      // or when there's simply nothing on the board with counters.
      label: 'Increment all card counters',
      shortcut: shortcutHints['game.incrementAllCardCounters'],
      onClick: () => {
        const targets =
          selection?.zone === 'battlefield' && selection.ids.size > 0
            ? battlefieldDisplayList.filter((c) =>
              selection.ids.has(c.id),
            )
            : battlefieldDisplayList;
        // Collect every (cardId, counterId, currentValue+1) into one
        // list; the batching helper packs them into a single
        // CommandContainer so the whole increment lands atomically
        // (mirrors Cockatrice's prepareGameCommand(commandList) in
        // actIncrementAllCardCounters, player_actions.cpp:1618-1620).
        const entries: {
          cardId: number;
          counterId: number;
          value: number;
        }[] = [];
        for (const card of targets) {
          const cardIdNum = Number(card.id);
          if (!Number.isFinite(cardIdNum)) {
            continue;
          }
          for (const counter of card.counters ?? []) {
            if (counter.value >= MAX_COUNTER_VALUE) {
              continue;
            }
            entries.push({
              cardId: cardIdNum,
              counterId: counter.id,
              value: counter.value + 1,
            });
          }
        }
        if (entries.length > 0) {
          counterCommands.setCardCounters(entries);
        }
      },
      disabled:
        battlefieldDisplayList.length === 0,
    },
    { divider: true },
    {
      // "Untap all permanents" — port of Cockatrice's actUntapAll.
      // Fires one Command_SetCardAttr with cardId=-1 (Servatrice's
      // "all cards in zone" sentinel), which the server iterates
      // over every card in TABLE and untaps each while respecting
      // per-card `doesntUntap` flags (server_card.cpp:70). This is
      // the same wire the phase-tracker's untap-step double-click
      // fires (usePhaseBar.ts:41-51) — one wire, whole battlefield.
      // Not phase-gated here — the menu action is always available.
      label: 'Untap all permanents',
      onClick: () => cardCommands.untapAll(),
      shortcut: shortcutHints['game.untapAll'],
    },
    { divider: true },
    {
      label: 'Roll die...',
      onClick: () => onRequestRollDie?.(),
      shortcut: shortcutHints['game.rollDice'],
    },
    {
      // "Flip coin" — port of actFlipCoin (player_actions.cpp:866-872).
      // Cockatrice models a coin flip as a `Command_RollDie(sides=2,
      // count=1)`; server broadcasts Event_RollDie and the chat log
      // renders the heads/tails outcome.
      label: 'Flip coin',
      onClick: () => counterCommands.flipCoin(),
      shortcut: shortcutHints['game.flipCoin'],
    },
    { divider: true },
    {
      // "Create token..." — opens the modal, on submit fires
      // Command_CreateToken and snapshots the payload into lastToken
      // so "Create another token" can re-fire without the modal.
      // Matches Cockatrice's actCreateToken (player_actions.cpp:878-892):
      // stores lastTokenInfo, then chains into actCreateAnotherToken.
      label: 'Create token...',
      onClick: () => openCreateTokenDialog(),
      shortcut: shortcutHints['game.createToken'],
    },
    {
      // "Create another token" — direct re-fire with the last submitted
      // args. Mirrors Cockatrice's actCreateAnotherToken which early-
      // returns when lastTokenInfo.name is empty (player_actions.cpp:895);
      // we disable the menu item instead so the state matches Cockatrice's
      // "enable" signal (requestEnableAndSetCreateAnotherTokenAction).
      label: 'Create another token',
      onClick: () => {
        if (lastToken) {
          cardCommands.createToken(lastToken);
        }
      },
      disabled: !lastToken,
      shortcut: shortcutHints['game.createAnotherToken'],
    },
    {
      label: 'Create predefined token',
      // Populated at runtime from the deck's tokens zone in Cockatrice.
      disabled: true,
    },
    { divider: true },
    {
      label: 'Game info...',
      onClick: () => onRequestGameInfo?.(),
    },
  ];

  // Opponent battlefield right-click menu. Ports Cockatrice's
  // player_menu.cpp:14-58 opponent branch: all utility items (Create
  // token, Roll die, Counters, Untap all, Hand / Library / Sideboard
  // submenus) are OWN-ONLY, so the opponent menu narrows to just the
  // two public zones you can peek at — graveyard and exile. Reuses
  // the same opponent grave/exile item arrays the pile-level menus
  // already attach so "View graveyard" opens the same LibrarySearch
  // dialog either way.
  const opponentBattlefieldMenuItems: ContextMenuItem[] = [
    { label: 'Graveyard', submenu: graveMenuItemsOpponent },
    { label: 'Exile', submenu: exileMenuItemsOpponent },
  ];

  // The drag ghost: the dragged cards under the pointer, anchored where the
  // first was grabbed. Library drags show a card back: the server's position
  // is authoritative, so the local top card's face could be the wrong card.
  const renderDragGhost = (
    cards: readonly HandCard[],
    zone: DragSourceZone,
    lent: boolean,
    origin: { x: number; y: number },
  ) =>
    cards.map((c, i) => {
      // Runtime object is the FULL BattlefieldCard when the
      // source is the battlefield (BattlefieldCard extends
      // HandCard so the widening at drag start doesn't strip
      // the fields — they just get erased in the static type).
      // Cast to read the extended props so the ghost mirrors
      // what the resting card looks like: modified P/T, on-card
      // counters, annotation pill, face-down flip, tapped
      // rotation, picked printing. Non-battlefield sources
      // (hand / graveyard / exile / stack) leave the extended
      // fields undefined, and Card handles that gracefully.
      const bc = c as BattlefieldCard;
      const baseMeta = cardMetaByName.get(c.name);
      const isLibraryBack = zone === 'library' && !lent;
      return (
        <div
          key={c.id}
          data-drag-ghost
          style={{
            position: 'fixed',
            left: origin.x + i * 4,
            top: origin.y + i * 4,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            pointerEvents: 'none',
            // Above the search-library dialog (z-1000) so a
            // card dragged out of the dialog is visible under
            // the cursor from the moment the drag starts.
            zIndex: 1100 + i,
            // Tapped cards drag rotated 90° like they render
            // on the board (plus a small tilt for depth).
            transform: `rotate(${bc.tapped ? 92 : 2}deg)`,
            filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.4))',
          }}
        >
          {isLibraryBack ? (
            <img
              src={CARD_BACK_URL}
              alt=''
              draggable={false}
              className='w-full h-full select-none pointer-events-none'
              style={{ borderRadius: CARD_CORNER_RADIUS }}
            />
          ) : (
            <Card
              id={c.id}
              name={c.name}
              scryfallId={c.scryfallId || baseMeta?.scryfallId}
              pt={bc.pt || (bc.faceDown ? undefined : baseMeta?.pt)}
              basePT={baseMeta?.pt}
              annotation={bc.annotation}
              counters={bc.counters}
              faceDown={bc.faceDown}
              imageUri={resolveFaceImageUri(c.name)}
            />
          )}
        </div>
      );
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
    exileTop,
    exileZoneRef,
    flights,
    flipHandCardBacks,
    gameSelection,
    graveDisplayList,
    graveMenuItemsOpponent,
    graveMenuItemsSelf,
    graveyardTop,
    graveyardZoneRef,
    handAnimating,
    handCount,
    handDisplayList,
    handExpanded,
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
    manaPool,
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
    renderDragGhost,
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
    setHandAnimating,
    setHandExpanded,
    setLife,
    setSelection,
    shortcutHints,
    stackCardMenu,
    stackDisplayList,
    stackSize,
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
