import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForkRef } from '@mui/material/utils';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import {
  BATTLEFIELD_GAP_PX as BATTLEFIELD_GAP_PX_BASE,
  STACK_OFFSET_PX as STACK_OFFSET_PX_BASE,
  STACK_OFFSET_Y_PX as STACK_OFFSET_Y_PX_BASE,
  BATTLEFIELD_ROW_PADDING_PX as BATTLEFIELD_ROW_PADDING_PX_BASE,
  BATTLEFIELD_MARGIN_LEFT_PX as BATTLEFIELD_MARGIN_LEFT_PX_BASE,
  BATTLEFIELD_MARGIN_RIGHT_PX as BATTLEFIELD_MARGIN_RIGHT_PX_BASE,
  BATTLEFIELD_MARGIN_TOP_PX as BATTLEFIELD_MARGIN_TOP_PX_BASE,
  BATTLEFIELD_MIN_COLS,
  BATTLEFIELD_ROWS,
  computeCellWidths,
  rowTopY,
  slotOriginPx,
  computeContentWidth,
  computeContentHeight,
  snapPxToSlot,
  layoutStackPile,
  SEAT_CARD_HEIGHT_PX as CARD_H_PX_BASE,
  SEAT_CARD_WIDTH_PX as CARD_W_PX_BASE,
  STACK_PILE_HORIZONTAL_OFFSET_PX,
  type BattlefieldLayoutOpts,
} from '../../battlefield/Battlefield/battlefieldLayout';
import { MAX_SUBPOS } from '../../battlefield/Battlefield/gridMath';
import { applyPTDelta, applyPTSet, parsePT } from '../../context-menus/CardContextMenu/cardAttributeEdits';
import {
  annotationPrompt,
  cardCounterPrompt,
  expressionPrompt,
  libraryCountPrompt,
  moveXFromTopPrompt,
  powerToughnessPrompt,
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
import type { FilterableCard } from '../../../utils/cardFilter';
import { lookupCard, lookupCards, type LookupCardFace, type LookupResult, type RelatedCardRef } from '@app/services';
import { MANA_COLORS } from '../../right-sidebar/PlayerInfoPanel/manaColors';
import { deckCardImageUrl } from './deckCardImageUrl';
import { toRecipient } from './revealRecipient';

/** Seat card shapes. Owned by the PlayerBoard seat contract; the aliases keep
 *  this façade's local names until its regions move to PlayerBoard. */
type HandCard = PlayerCardViewModel;
type BattlefieldCard = BattlefieldCardViewModel;

/** Which zone a drag was initiated from. */
type DragSourceZone = SeatZone;

/** A marquee selection is always within a single zone. */
type Selection = SeatSelection;


/** Card counter letters by counter id (desktop's six counter slots). */
const COUNTER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** The cards a card prompt applies to, and the clicked card that seeds it. */
interface PromptTargets {
  targetIds: number[];
  cardName: string;
  current: string;
}

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
    openPrompt,
    openCreateToken,
  } = useGameDialogsContext();

  // Scaled versions of the base card-related pixel constants. Every layout
  // computation in this component that measures against card size (grid
  // fit, hit-testing, stack layouts, gaps between cards) uses these so a
  // slider adjustment in the header immediately reshapes the play area.
  // Non-card UI (mana pips, life total, sidebar preview, etc.) is
  // unaffected because it doesn't reference these constants.
  const { scale } = useCardScale();
  const CARD_W_PX = CARD_W_PX_BASE * scale;
  const CARD_H_PX = CARD_H_PX_BASE * scale;
  const BATTLEFIELD_GAP_PX = BATTLEFIELD_GAP_PX_BASE * scale;
  const STACK_OFFSET_PX = STACK_OFFSET_PX_BASE * scale;
  const STACK_OFFSET_Y_PX = STACK_OFFSET_Y_PX_BASE * scale;
  const STACK_HOFFSET_PX = STACK_PILE_HORIZONTAL_OFFSET_PX * scale;
  const BATTLEFIELD_ROW_PADDING_PX = BATTLEFIELD_ROW_PADDING_PX_BASE * scale;
  const BATTLEFIELD_MARGIN_LEFT_PX = BATTLEFIELD_MARGIN_LEFT_PX_BASE * scale;
  const BATTLEFIELD_MARGIN_RIGHT_PX = BATTLEFIELD_MARGIN_RIGHT_PX_BASE * scale;
  const BATTLEFIELD_MARGIN_TOP_PX = BATTLEFIELD_MARGIN_TOP_PX_BASE * scale;
  // Shared layout options for every battlefield helper call in this
  // PlayerBox. All px values already include the card scale so the
  // helpers stay unit-agnostic — they just do sums and lookups.
  const battlefieldLayout: BattlefieldLayoutOpts = {
    cardWidthPx: CARD_W_PX,
    cardHeightPx: CARD_H_PX,
    gapXPx: BATTLEFIELD_GAP_PX,
    gapYPx: BATTLEFIELD_ROW_PADDING_PX,
    marginLeftPx: BATTLEFIELD_MARGIN_LEFT_PX,
    marginRightPx: BATTLEFIELD_MARGIN_RIGHT_PX,
    marginTopPx: BATTLEFIELD_MARGIN_TOP_PX,
    stackOffsetXPx: STACK_OFFSET_PX,
    stackOffsetYPx: STACK_OFFSET_Y_PX,
    minCols: BATTLEFIELD_MIN_COLS,
    rows: BATTLEFIELD_ROWS,
  };
  // Reserved room at the visual bottom of the battlefield so a fully
  // stacked bottom-row slot (up to MAX_SUBPOS cards, each
  // offset by STACK_OFFSET_Y_PX from the last) doesn't clip past the
  // container edge.
  const stackExtPx = (MAX_SUBPOS - 1) * STACK_OFFSET_Y_PX;

  // Preload every image in the viewer's deck the moment we have the deck
  // list, so drawing feels instant instead of waiting on Scryfall. Only for
  // the local player — opponents' hand cards never reveal their face, so
  // burning bandwidth on their images would be wasted.
  useEffect(() => {
    if (!isSelf || deckCards.length === 0) {
      return;
    }
    for (const c of deckCards) {
      if (c.sideboard) {
        continue;
      }
      const img = new Image();
      img.src = deckCardImageUrl(c);
    }
  }, [isSelf, deckCards]);

  // Prefetch every deck card's metadata (`type_line` for hand
  // double-click auto-routing + `power`/`toughness` for the P/T pill
  // on the battlefield). The .cod XML we upload doesn't carry either,
  // so we backfill from the Dexie card DB (Cockatrice XML import) and
  // fall back to Scryfall on miss. Cached by card name because that's
  // what both consumers have cheaply available.
  // Card metadata cache keyed by name. Consumed by:
  //   • Battlefield P/T pills (typeLine + pt).
  //   • Card context menu's currentPT fallback.
  // The .cod XML we upload doesn't carry these fields, so we backfill
  // from the Dexie card DB (Cockatrice XML import) and fall back to
  // Scryfall on miss.
  const [cardMetaByName, setCardMetaByName] = useState<
    Map<
      string,
      {
        typeLine: string;
        pt?: string;
        manaCost?: string;
        cmc?: number;
        colors?: string[];
        power?: string;
        toughness?: string;
        /** Names of tokens (and other related cards) this card
         *  references — powers the "Token: …" items at the bottom of
         *  the right-click menu, matching Cockatrice's
         *  addRelatedCardActions (card_menu.cpp:407-479). Undefined
         *  when the source doesn't carry relations (Scryfall) or the
         *  card genuinely has none. */
        related?: RelatedCardRef[];
        /** Scryfall layout ("transform", "modal_dfc", etc.) — gates
         *  the "Token: Transform into …" menu item. Undefined for
         *  cards.xml-only sources (Cockatrice XML doesn't carry
         *  layout info). */
        layout?: string;
        /** Face data for multi-faced cards. Populated from Scryfall
         *  `card_faces`. Powers the transform target lookup: the
         *  non-current face becomes the new-token payload for
         *  Command_CreateToken with target_mode=TRANSFORM_INTO. */
        faces?: LookupCardFace[];
        /** Scryfall id from the first known printing. Used as a
         *  fallback when the wire's ServerInfo_Card has no
         *  providerId (older deck uploads without per-card uuid
         *  attributes) so Card.tsx can hit the CDN directly instead
         *  of the rate-limited /cards/named endpoint. */
        scryfallId?: string;
      }
    >
  >(() => new Map());
  // Resolved token records (full LookupResult per token) keyed by
  // TOKEN name. Populated as battlefield cards' related lists land —
  // see the tokenMetaByName effect below. Tokens are just cards to
  // Scryfall, so we reuse `lookupCard` (which hits Dexie's
  // scryfallCache first, network second) to enrich them. The map
  // stores `LookupResult` so downstream can read power/toughness/
  // colors/printings directly.
  const [tokenMetaByName, setTokenMetaByName] = useState<
    Map<string, LookupResult>
  >(() => new Map());

  /**
   * Resolve the per-face image URL for a card whose current wire
   * name matches one face of a multi-faced record cached in
   * cardMetaByName. Returns undefined for single-face cards or when
   * the lookup effect hasn't populated the DFC yet — Card.tsx
   * gracefully falls back to its default scryfallId-composed URL in
   * that case.
   *
   * Motivation: after a DFC transform (Command_CreateToken with
   * target_mode=TRANSFORM_INTO, Cockatrice-style), the server sets
   * the new card's providerId to the SOURCE card's Scryfall id
   * (Cockatrice's player_actions.cpp:1204 keeps the source's
   * providerId). Scryfall's `/cards/<id>?format=image` for that id
   * always returns the FRONT face, so without a per-face override
   * the transformed card keeps rendering the front face's art.
   * This helper feeds `imageUri` into Card.tsx so the back-face
   * image loads.
   */
  const resolveFaceImageUri = (cardName: string): string | undefined => {
    const meta = cardMetaByName.get(cardName);
    if (!meta?.faces || meta.faces.length < 2) {
      return undefined;
    }
    return meta.faces.find((f) => f.name === cardName)?.imageUri;
  };
  useEffect(() => {
    if (!isSelf || deckCards.length === 0) {
      return;
    }
    let cancelled = false;
    // Include sideboard cards in the Scryfall metadata fetch —
    // the sideboard viewer's Group by Type / Sort by CMC / etc.
    // dropdowns need the same enrichment as the main deck view.
    // Sideboard cards were previously filtered out under the
    // assumption they wouldn't be inspected in-game.
    const uniqueNames = Array.from(
      new Set(deckCards.map((c) => c.name)),
    ).filter((name) => !cardMetaByName.has(name));
    if (uniqueNames.length === 0) {
      return;
    }
    void (async () => {
      const results = await Promise.all(
        uniqueNames.map(async (name) => {
          const r = await lookupCard(name);
          const pt =
            r.power != null && r.toughness != null
              ? `${r.power}/${r.toughness}`
              : undefined;
          return [
            name,
            {
              typeLine: r.typeLine ?? '',
              pt,
              manaCost: r.manaCost,
              cmc: r.cmc,
              colors: r.colors,
              power: r.power,
              toughness: r.toughness,
              related: r.related,
              layout: r.layout,
              faces: r.faces,
              scryfallId: r.printings[0]?.scryfallId,
            },
          ] as const;
        }),
      );
      if (cancelled) {
        return;
      }
      setCardMetaByName((prev) => {
        const next = new Map(prev);
        for (const [name, meta] of results) {
          next.set(name, meta);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // cardMetaByName intentionally omitted: we don't want an
    // "already-cached names" recomputation to re-enter the effect,
    // just want a re-run when the deck changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [isSelf, deckCards]);

  // Fetch Scryfall metadata for cards currently on the battlefield
  // — runs for BOTH self and opponent PlayerBoxes. The initial deck-
  // driven lookup above (gated to `isSelf` because opponent decks
  // aren't wired) only ever populates the local player's own card
  // names, so opponent creatures had no printed-PT fallback and
  // rendered without their P/T pill. This effect closes that gap by
  // enriching whatever appears on the battlefield right now, so an
  // opponent's Grizzly Bears reads "2/2" the same as one you cast
  // yourself. Skipped when the deck-driven effect above already
  // covered the name (has-check).
  useEffect(() => {
    if (zones.battlefield.cards.length === 0) {
      return;
    }
    let cancelled = false;
    const uniqueNames = Array.from(
      new Set(zones.battlefield.cards.map((c) => c.name)),
    ).filter((name) => name && !cardMetaByName.has(name));
    if (uniqueNames.length === 0) {
      return;
    }
    void (async () => {
      const results = await Promise.all(
        uniqueNames.map(async (name) => {
          const r = await lookupCard(name);
          const pt = r.power != null && r.toughness != null
            ? `${r.power}/${r.toughness}`
            : undefined;
          return [
            name,
            {
              typeLine: r.typeLine ?? '',
              pt,
              manaCost: r.manaCost,
              cmc: r.cmc,
              colors: r.colors,
              power: r.power,
              toughness: r.toughness,
              related: r.related,
              layout: r.layout,
              faces: r.faces,
              scryfallId: r.printings[0]?.scryfallId,
            },
          ] as const;
        }),
      );
      if (cancelled) {
        return;
      }
      setCardMetaByName((prev) => {
        const next = new Map(prev);
        for (const [name, meta] of results) {
          next.set(name, meta);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // cardMetaByName intentionally omitted for the same reason as
    // the deck-driven effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [zones.battlefield.cards]);

  // Resolve related-card metadata for every parent card that has a
  // related list. Powers the "Token: …" right-click menu items
  // (Cockatrice's addRelatedCardActions, card_menu.cpp:407-479).
  //
  // Tokens (and transform back-faces) are just cards to Scryfall —
  // `lookupCards` hits the persistent scryfallCache first and only
  // reaches the network for names we've never seen. Batched to keep
  // network traffic to at most one /cards/collection round-trip per
  // effect firing (75 identifiers per request, chunked internally).
  //
  // Runs whenever cardMetaByName grows (new card seen with related
  // list). Skips names already resolved so re-runs are cheap.
  useEffect(() => {
    const needed: string[] = [];
    for (const meta of cardMetaByName.values()) {
      if (!meta.related) {
        continue;
      }
      for (const ref of meta.related) {
        if (!tokenMetaByName.has(ref.name)) {
          needed.push(ref.name);
        }
      }
    }
    const uniqueNeeded = Array.from(new Set(needed));
    if (uniqueNeeded.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await lookupCards(uniqueNeeded);
      if (cancelled) {
        return;
      }
      setTokenMetaByName((prev) => {
        const next = new Map(prev);
        // Always cache the answer (even `source: "unknown"`) so we
        // don't re-issue the lookup for a name we already tried.
        for (const name of uniqueNeeded) {
          const r = results.get(name);
          next.set(
            name,
            r ?? { found: false, source: 'unknown', name, printings: [] },
          );
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // tokenMetaByName intentionally omitted — its own updates would
    // otherwise re-enter the effect. Re-runs when cardMetaByName
    // gains new entries with related lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [cardMetaByName]);

  const deckCount = zones.library.cardCount ?? 0;

  // Refs for measuring the library card and hand zone positions so we can
  // animate a card back travelling between them.
  const libraryRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  // Ref to the search-library dialog while open. The dialog usually
  // floats over the play area's library pile, so drops landing on
  // the dialog need to resolve to the library zone too (otherwise
  // the user can drag cards out but not back in). Populated by the
  // dialog via a callback ref.

  // In-flight draw animations. Purely visual: a card back tweens from
  // the library rect to the hand rect whenever this player's hand
  // count grows in Redux (a draw or mulligan just happened). Doesn't
  // touch any game state — the drawn card is already committed to
  // Redux by the time the animation starts; the flight is decoration
  // that fires alongside.
  const DRAW_ANIMATION_MS = 450;
  const flightIdCounterRef = useRef(0);
  const [flights, setFlights] = useState<
    { id: number; from: DOMRect; to: DOMRect; landed: boolean }[]
  >([]);
  // Tracks the last observed `drawSeq` from Redux so the effect only fires
  // when the beacon actually ticks — not on unrelated re-renders.
  const prevDrawSeqForFlightRef = useRef<number | null>(null);

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

  // The battlefield has TWO refs now that it can scroll horizontally:
  //   - `scrollContainerRef`: the visible/scrollable viewport. Measured
  //     here so we know how many columns naturally fit on-screen.
  //   - `battlefieldRef`: the sized content div holding cards + slot
  //     outlines. Its explicit width grows past the viewport as the grid
  //     extends past the fit, triggering horizontal scroll.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const battlefieldRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      setFitSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Translate vertical wheel input into horizontal scroll for the
  // battlefield + hand scroll containers. Must attach via
  // addEventListener with `{ passive: false }` — React's synthetic
  // onWheel is passive-by-default (browsers made this a spec-level
  // scrolling perf optimization in 2016+), so calling preventDefault
  // inside a React onWheel throws the "Unable to preventDefault
  // inside passive event listener" warning on every scroll and the
  // scroll still bubbles to the outer page.
  useEffect(() => {
    const targets: (HTMLElement | null)[] = [
      scrollContainerRef.current,
      handRef.current,
    ];
    const handleWheel = (e: WheelEvent) => {
      const el = e.currentTarget as HTMLElement | null;
      if (!el) {
        return;
      }
      if (el.scrollWidth <= el.clientWidth) {
        return;
      }
      if (e.deltaY === 0) {
        return;
      }
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    for (const el of targets) {
      if (el) {
        el.addEventListener('wheel', handleWheel, { passive: false });
      }
    }
    return () => {
      for (const el of targets) {
        if (el) {
          el.removeEventListener('wheel', handleWheel);
        }
      }
    };
  }, []);
  // Battlefield source-of-truth for layout — Redux is the only source.
  // See the top-of-file note about local-mock removal.
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

  // Parent → children map for attached cards on THIS player's board.
  // Hoisted early because `computeCellWidths` needs each parent's
  // attach count to widen the parent's cell (cells hosting a heavily-
  // fanned parent grow to the left so the leftward-extending children
  // don't overlap the neighboring column). Reused later by the render
  // pass for absolute positioning.
  const attachedChildrenByParent = (() => {
    const m = new Map<number, BattlefieldCard[]>();
    for (const c of battlefieldDisplayList) {
      if (
        c.attachTargetCardId != null &&
        c.attachTargetPlayerId === playerId
      ) {
        const list = m.get(c.attachTargetCardId) ?? [];
        list.push(c);
        m.set(c.attachTargetCardId, list);
      }
    }
    return m;
  })();
  // Attached-to-own-parent cards live at wire (x=-1, y=-1) — they don't
  // occupy their own slot on the battlefield. Filter them out of the
  // layout input so col 0 / row 0 isn't inflated by every attached card
  // ending up there. The full battlefieldDisplayList is still what the
  // render loop iterates; layout just needs the "free-standing" set.
  //
  // Each free-standing parent carries its `attachedChildCount` so
  // `computeCellWidths` can widen the parent's cell to hold the fan,
  // pushing subsequent columns right — otherwise the leftward-fanning
  // children would overlap the previous column's card.
  const battlefieldForLayout = battlefieldDisplayList
    .filter(
      (c) =>
        c.attachTargetCardId == null || c.attachTargetPlayerId !== playerId,
    )
    .map((c) => ({
      // Layout math (computeCellWidths / columnLeftX / slotOriginPx /
      // computeContentWidth / snapPxToSlot) is entirely in DISPLAY
      // coord — that's the space the rendered cards, slot outlines,
      // and drop hit-tests all live in. For a mirrored opponent
      // battlefield, wire row 0 (creatures) shows at display row
      // ROWS-1. Passing the wire row in here would key cellWidths by
      // the wrong row and the stack-widening would push cards over
      // in the WRONG visual row (looked like only the bottom row
      // widening when the user stacked cards in the top). Flip up
      // front so every downstream lookup speaks the same language.
      row: handOnTop ? BATTLEFIELD_ROWS - 1 - c.slot.row : c.slot.row,
      col: c.slot.col,
      subSlot: c.subSlot,
      attachedChildCount:
        attachedChildrenByParent.get(Number(c.id))?.length ?? 0,
    }));
  // Per-cell horizontal footprint — a cell with 3 stacked cards is
  // 2×STACK_OFFSET_PX wider than a solo cell, and columns to the right
  // of it shift over by that difference. Ported from Cockatrice's
  // `TableZone::computeCardStackWidths`.
  const cellWidths = computeCellWidths(battlefieldForLayout, battlefieldLayout);
  // Effective min-cols: cap BATTLEFIELD_MIN_COLS at whatever fits in
  // the visible container width. Cockatrice enforces its 5-col MIN_WIDTH
  // via a scene-side floor and lets fitInView scale everything down to
  // fit; we hold card size fixed (height-driven scale) and instead
  // shrink the min-cols reservation so the empty grid doesn't overflow
  // horizontally. `+1` in the fit formula accounts for margins and the
  // final card not needing a trailing gap.
  const effectiveMinCols = (() => {
    if (fitSize.w <= 0) {
      return BATTLEFIELD_MIN_COLS;
    }
    const usable =
      fitSize.w - BATTLEFIELD_MARGIN_LEFT_PX - BATTLEFIELD_MARGIN_RIGHT_PX;
    const perCol = CARD_W_PX + BATTLEFIELD_GAP_PX;
    const fitCols = Math.max(1, Math.floor((usable + BATTLEFIELD_GAP_PX) / perCol));
    return Math.min(BATTLEFIELD_MIN_COLS, fitCols);
  })();
  // Per-row column count including one buffer past the rightmost card
  // (or the min-cols floor) — matches Cockatrice's "always leave a drop
  // target on the right" behavior. Used by the slot overlay to know how
  // many dashed outlines to render per row.
  const colsByRow = (() => {
    const out = new Array<number>(BATTLEFIELD_ROWS).fill(0);
    const maxCol = new Array<number>(BATTLEFIELD_ROWS).fill(-1);
    for (const c of battlefieldForLayout) {
      if (c.row >= 0 && c.row < BATTLEFIELD_ROWS) {
        maxCol[c.row] = Math.max(maxCol[c.row], c.col);
      }
    }
    for (let r = 0; r < BATTLEFIELD_ROWS; r++) {
      out[r] = Math.max(effectiveMinCols, maxCol[r] + 2);
    }
    return out;
  })();
  // Content pixel size — sum of per-row column widths + margins. When
  // stacks push columns right, or when a buffer column opens past the
  // fit width, the content grows past fitSize.w and the scroll container
  // starts scrolling horizontally.
  const naturalContentW = computeContentWidth(
    cellWidths,
    battlefieldForLayout,
    { ...battlefieldLayout, minCols: effectiveMinCols },
  );
  const naturalContentH = computeContentHeight(battlefieldLayout) + stackExtPx;
  // Legacy slot-bound shims — group drops / nearest-available-slot search
  // originally iterated a rectangular `grid.cols × grid.rows` space; with
  // per-row column counts we use the widest row as the effective width.
  // Wire rows are fixed at BATTLEFIELD_ROWS.
  const gridRows = BATTLEFIELD_ROWS;
  const gridCols = Math.max(BATTLEFIELD_MIN_COLS, ...colsByRow);

  // Auto-scroll the battlefield to the rightmost edge whenever a
  // genuinely NEW column opens — a card placed on the buffer column
  // past the rightmost stack pushes `maxColsInAnyRow` up by one. Only
  // this case gets the scroll; stacking cards onto an EXISTING slot
  // grows that cell's width and shifts later columns right, but should
  // NOT auto-scroll (the user is looking at the stack they're building,
  // scrolling away hides it).
  const maxColsInAnyRow = colsByRow.reduce((m, n) => Math.max(m, n), 0);
  const prevMaxColsRef = useRef(maxColsInAnyRow);
  useEffect(() => {
    if (maxColsInAnyRow > prevMaxColsRef.current) {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      }
    }
    prevMaxColsRef.current = maxColsInAnyRow;
  }, [maxColsInAnyRow]);

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


  // Life total — starts at Commander 40. Only mutable by the owning
  // player; opponents render the number read-only. Capped at 9999 so
  // the number can't overflow the display box or (more importantly)
  // push the info column into an obviously silly state.
  const LIFE_MAX = 9999;
  // Matches Cockatrice's counter_limits.h — Servatrice clamps card
  // counter values to [0, 999] server-side. Used client-side by the
  // "Increment all card counters" flow to skip counters already at
  // the cap (matches actIncrementAllCardCounters at
  // player_actions.cpp:1605).
  const MAX_COUNTER_VALUE = 999;
  // Fallback local life state — only used when no `lifeControl` prop
  // is passed (transient pre-hydration or when the player's life
  // counter hasn't landed in Redux yet).
  const [localLife, setLocalLifeState] = useState(40);
  const life = lifeControl ? lifeControl.value : localLife;
  const setLife = (next: number | ((prev: number) => number)) => {
    if (lifeControl) {
      // Controlled: compute the target value + delta and dispatch.
      // Callers that pass a plain number → `onSet`; callers that pass
      // a `(prev) => next` function get their delta forwarded via
      // `onDelta` so downstream selectors can decide whether to emit
      // an inc- or set-counter command (usually inc for the ±1 hover
      // paths, set for the edit-mode input).
      if (typeof next === 'function') {
        const target = Math.min(LIFE_MAX, Math.trunc(next(life)));
        lifeControl.onDelta(target - life);
      } else {
        lifeControl.onSet(Math.min(LIFE_MAX, Math.trunc(next)));
      }
      return;
    }
    setLocalLifeState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      return Math.min(LIFE_MAX, Math.trunc(raw));
    });
  };
  // Set life (Ctrl+L, Counters → Life) and the mana / storm counters'
  // "Set counter..." share the game's sum prompt. Command_SetCounter takes
  // the absolute value; Servatrice clamps it, and player counters floor at 0.
  const openLifePrompt = () => openPrompt(expressionPrompt({ current: life, onSubmit: (value) => setLife(value) }));
  const openCounterPrompt = ({ counterId, label, currentValue }: {
    counterId: number;
    label: string;
    currentValue: number;
  }) => openPrompt(expressionPrompt({
    current: currentValue,
    title: `Set ${label.toLowerCase()} counter`,
    label,
    description: `Current: ${currentValue}`,
    onSubmit: (value) => counterCommands.set(counterId, Math.max(0, value)),
  }));
  // Set annotation / Set P/T prompts. The target ids are snapshotted when
  // the prompt opens, so the answer applies to every card that was selected
  // then, even if the selection changes meanwhile (Cockatrice's
  // cardMenuAction pattern); a single right-click carries just that card.
  // Each P/T target uses ITS OWN current P/T as the applyPTSet base, read at
  // submit time (so `+1/+1` bumps a 2/2 to 3/3 and a 4/5 to 5/6 in one
  // atomic cardCommands.setPT batch, like desktop's actSetPT loop).
  const ptBaseRef = useRef({ battlefieldDisplayList, cardMetaByName });
  ptBaseRef.current = { battlefieldDisplayList, cardMetaByName };
  const openAnnotationPrompt = ({ targetIds, cardName, current }: PromptTargets) =>
    openPrompt(annotationPrompt({
      cardName,
      current,
      // No bulk-annotation wire: one Command_SetCardAttr per card, as
      // desktop's actSetAnnotation iterates selectedCards.
      onSubmit: (value) => {
        for (const id of targetIds) {
          cardCommands.setAnnotation(id, value);
        }
      },
    }));
  const openPTPrompt = ({ targetIds, cardName, current }: PromptTargets) =>
    openPrompt(powerToughnessPrompt({
      cardName,
      current,
      onSubmit: (value) => {
        const { battlefieldDisplayList: board, cardMetaByName: meta } = ptBaseRef.current;
        const entries = targetIds.map((id) => {
          const bc = board.find((x) => Number(x.id) === id);
          const base = bc?.pt || (bc ? meta.get(bc.name)?.pt ?? '' : '');
          return { cardId: id, pt: applyPTSet(base, value) };
        });
        if (entries.length > 0) {
          cardCommands.setPT(entries);
        }
      },
    }));
  // "X cards from the top of library..." prompt: Command_MoveCard with x = N
  // puts the card at position N of the library. The library size is
  // snapshotted when it opens, so a draw meanwhile doesn't move the clamp.
  const openMoveXFromTopPrompt = ({ cardId, cardName, deckSize }: { cardId: number; cardName: string; deckSize: number }) =>
    openPrompt(moveXFromTopPrompt({
      cardName,
      deckSize,
      initial: Math.min(3, Math.max(0, deckSize)),
      onSubmit: (position) => zoneCommands.moveCards(ZoneName.TABLE, [cardId], { zone: ZoneName.DECK, index: position, reversed: false }),
    }));
  // Library count prompts: Draw cards..., View top / bottom cards..., Reveal
  // top cards to..., and the Top / Bottom of library "N cards" items. Each
  // snapshots the library size when it opens and clamps the answer to it, so
  // a concurrent draw doesn't move the goalposts while the user types.
  // Defaults: 1 for Draw cards (desktop's actRequestDrawCardsDialog), else 3.
  const countDefault = (deckSize: number) => Math.min(3, Math.max(1, deckSize));
  const openCountPrompt = ({ title, submitLabel, deckSize, onSubmit }: {
    title: string;
    submitLabel: string;
    deckSize: number;
    onSubmit: (n: number) => void;
  }) => openPrompt(libraryCountPrompt({ title, submitLabel, deckSize, initial: countDefault(deckSize), onSubmit }));
  const openDrawCardsPrompt = ({ deckSize }: { deckSize: number }) =>
    openPrompt(libraryCountPrompt({ title: 'Draw cards', submitLabel: 'Draw', deckSize, initial: 1, onSubmit: (n) => draw(n) }));
  // View top / bottom: Command_DumpZone for N cards, then the zone view opens
  // on the revealed snapshot (desktop actViewTopCards / actViewBottomCards).
  const openViewLibraryCountPrompt = ({ isReversed, deckSize }: { isReversed: boolean; deckSize: number }) =>
    openCountPrompt({
      title: isReversed ? 'View bottom cards of library' : 'View top cards of library',
      submitLabel: 'View',
      deckSize,
      onSubmit: (n) => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK, numberCards: n, isReversed }),
    });
  // Reveal top N to a player: Command_RevealCards via onRevealTopCards
  // (`-1` = all players, sent with no player_id).
  const openRevealTopCardsPrompt = ({ targetPlayerId, targetName, deckSize }: {
    targetPlayerId: number;
    targetName: string;
    deckSize: number;
  }) => openCountPrompt({
    title: `Reveal top cards of library to ${targetName}`,
    submitLabel: 'View',
    deckSize,
    onSubmit: (n) => zoneCommands.reveal(ZoneName.DECK, toRecipient(targetPlayerId), { top: n }),
  });

  // "Set counters (X)..." prompt, seeded with the clicked (or first
  // selected) card's value. The target ids are snapshotted when it opens;
  // the answer goes to every one of them in one atomic CommandContainer, as
  // desktop's actSetCardCounter batches per-card SetCardCounter.
  const openCardCounterPrompt = ({ targetIds, cardName, counterId, currentValue }: {
    targetIds: number[];
    cardName: string;
    counterId: number;
    currentValue: number;
  }) => openPrompt(cardCounterPrompt({
    cardName,
    counterLetter: COUNTER_LETTERS[counterId] ?? String(counterId),
    current: currentValue,
    onSubmit: (value) => {
      counterCommands.setCardCounters(targetIds.map((id) => ({ cardId: id, counterId, value: Math.max(0, value) })));
    },
  }));
  // Last successfully-submitted token — powers "Create another token"
  // (Cockatrice's actCreateAnotherToken, player_actions.cpp:894-916).
  // Persisted across the dialog's open/close cycle so a subsequent
  // right-click → "Create another token" re-fires with the same args.
  const [lastToken, setLastToken] = useState<{
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
  } | null>(null);
  // "Create token..." opens the game's CreateTokenDialog seeded with the
  // last token (an "edit last token" flow). The token goes through this
  // seat's card port (onCreateToken: the local battlefield, tablerow y) and
  // becomes the new last token.
  const openCreateTokenDialog = () => openCreateToken({
    initial: lastToken,
    onSubmit: (token) => {
      setLastToken(token);
      cardCommands.createToken(token);
    },
  });
  // Pending-attach source: set when the user selects "Attach to card..."
  // from a battlefield card's context menu. Next click on a battlefield
  // card resolves the attach; Escape or clicking the source cancels.
  // Numeric `cardId` because Command_AttachCard needs the wire id, not
  // the string HandCard id. Only set on the isSelf PlayerBox (opponents
  // can't attach FROM their own cards via our UI). The ref is kept in
  // sync so the drag/pointerup useEffect closure — which captures
  // `drag` and only re-registers when it changes — can still read the
  // latest pending state without needing pending in its deps.
  const [attachPending, setAttachPending] = useState<
    { sourceCardId: number; sourceCardName: string } | null
  >(null);
  // Companion snapshot for multi-attach — Cockatrice attaches every
  // selected card to the target on completion. `attachPending` still
  // carries the visual anchor (single source id + arrow ring); this
  // holds the additional sources that also attach when the target is
  // clicked. Cleared alongside `attachPending`.
  const [attachExtraSourceIds, setAttachExtraSourceIds] = useState<readonly number[]>([]);
  const attachPendingRef = useRef(attachPending);
  const attachExtraSourceIdsRef = useRef(attachExtraSourceIds);
  useEffect(() => {
    attachPendingRef.current = attachPending;
  }, [attachPending]);
  useEffect(() => {
    attachExtraSourceIdsRef.current = attachExtraSourceIds;
  }, [attachExtraSourceIds]);
  // Pending draw-arrow — same shape as attachPending. Menu → set →
  // next battlefield card OR player-target click resolves. Rendered
  // as a live RED arrow following the cursor (Cockatrice's `Qt::red`
  // default for `actDrawArrow`).
  const [drawArrowPending, setDrawArrowPending] = useState<
    {
      sourceCardId: number;
      sourceCardName: string;
      /** Wire zone name of the source card. Defaults to TABLE (battlefield
       *  arrows), set to GRAVE / EXILE when the flow started from a
       *  pile-view modal's card context menu. Passed through to
       *  `targetCommands.createArrow` so the wire's `startZone` matches where the
       *  source card actually lives — arrows drawn from a grave card
       *  render off the grave pile at both ends' clients. */
      sourceZone: ZoneNameValue;
    } | null
  >(null);
  // Window-level click resolver for the draw-arrow flow. Unlike attach
  // (which can only target this player's own board), draw-arrow can
  // target ANY player's battlefield card OR any life-pill hitbox. Uses
  // capture-phase click on window so it fires before per-card handlers,
  // and hit-tests via data attributes. Set up only while pending.
  useEffect(() => {
    if (!drawArrowPending || playerId == null) {
      return undefined;
    }
    const onClick = (e: MouseEvent) => {
      // Only respond to LEFT clicks. Right-clicks are the drag-arrow
      // system; middle/other buttons are ignored.
      if (e.button !== 0) {
        return;
      }
      const source = drawArrowPending;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) {
        return;
      }
      // Card hit-test first: closest [data-card-id] with matching
      // owner/zone data attrs (same attrs the right-click-drag hook
      // uses). If found, target the card.
      const cardEl = el.closest('[data-card-id][data-card-owner][data-card-zone]') as HTMLElement | null;
      if (cardEl) {
        const targetPlayerId = Number(cardEl.getAttribute('data-card-owner'));
        const targetCardId = Number(cardEl.getAttribute('data-card-id'));
        if (
          Number.isFinite(targetPlayerId) &&
          Number.isFinite(targetCardId) &&
          !(targetPlayerId === playerId && targetCardId === source.sourceCardId)
        ) {
          e.preventDefault();
          e.stopPropagation();
          targetCommands.createArrow(source.sourceCardId, source.sourceZone, {
            kind: 'card',
            playerId: targetPlayerId,
            cardId: targetCardId,
          });
          setDrawArrowPending(null);
          return;
        }
        // Same-card click = cancel. Match Cockatrice's `targetItem == startItem`
        // short-circuit in `ArrowDragItem::mouseReleaseEvent`.
        if (targetPlayerId === playerId && targetCardId === source.sourceCardId) {
          e.preventDefault();
          e.stopPropagation();
          setDrawArrowPending(null);
          return;
        }
      }
      // Player-target hit-test.
      const playerEl = el.closest('[data-arrow-target-kind="player"]') as HTMLElement | null;
      if (playerEl) {
        const targetPlayerId = Number(playerEl.getAttribute('data-arrow-target-player-id'));
        if (Number.isFinite(targetPlayerId)) {
          e.preventDefault();
          e.stopPropagation();
          targetCommands.createArrow(source.sourceCardId, source.sourceZone, {
            kind: 'player',
            playerId: targetPlayerId,
          });
          setDrawArrowPending(null);
          return;
        }
      }
      // Click on empty space or non-target UI → cancel.
      setDrawArrowPending(null);
    };
    // Capture phase so we run before React's delegated handlers on the
    // battlefield cards (which would otherwise fire selection / other
    // click effects even after we set the pending state to null).
    window.addEventListener('click', onClick, { capture: true });
    return () => window.removeEventListener('click', onClick, { capture: true });
  }, [drawArrowPending, playerId, targetCommands]);
  // Escape cancels any menu-initiated pending flow (attach or draw
  // arrow). Kept on window so it fires regardless of what's focused.
  useEffect(() => {
    if (!attachPending && !drawArrowPending) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAttachPending(null);
        setDrawArrowPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachPending, drawArrowPending]);

  // Live pointer position — tracked while EITHER menu-initiated
  // arrow flow is pending so we can draw the arrow from the source
  // card to the cursor. Cleared when both flows end so the arrow
  // stops following. Cockatrice uses a mouse-grabbed ArrowAttachItem
  // / ArrowDragItem for the same visual (arrow_item.cpp:177+, 288+);
  // we render an SVG portal instead.
  const [pendingArrowPointer, setPendingArrowPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!attachPending && !drawArrowPending) {
      setPendingArrowPointer(null);
      return undefined;
    }
    const onMove = (e: MouseEvent) => {
      setPendingArrowPointer({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [attachPending, drawArrowPending]);
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

  // Fire flight animations from the library rect to the hand rect only
  // when the Redux draw beacon (`drawSeq`) ticks. The beacon is bumped
  // exclusively by the cardsDrawn listener (Event_DrawCards), so drags
  // from other zones into the hand — which grow `handCount` too — never
  // trigger this. `lastDrawCount` says how many flights to spawn. Each
  // PlayerBox measures against its OWN library/hand rects, so it works
  // for self draws (Ctrl+D, mulligan, opening hand) and opponents alike.
  // Guards: skip on first render (no baseline), skip if refs aren't
  // measurable, skip if the beacon didn't actually tick.
  useEffect(() => {
    const currentSeq = drawSeq ?? 0;
    const prev = prevDrawSeqForFlightRef.current;
    prevDrawSeqForFlightRef.current = currentSeq;
    if (prev === null) {
      return;
    } // first render — establish baseline only
    if (currentSeq <= prev) {
      return;
    }
    const drawn = lastDrawCount ?? 0;
    if (drawn <= 0) {
      return;
    }
    const libEl = libraryRef.current;
    const handEl = handRef.current;
    if (!libEl || !handEl) {
      return;
    }
    const from = libEl.getBoundingClientRect();
    const to = handEl.getBoundingClientRect();
    if (from.width === 0 || to.width === 0) {
      return;
    }
    for (let i = 0; i < drawn; i++) {
      const id = ++flightIdCounterRef.current;
      const startDelay = i * 90;
      window.setTimeout(() => {
        setFlights((prev) => [...prev, { id, from, to, landed: false }]);
        // Two rAFs so the initial style commits before the transition
        // target is set — otherwise browsers may collapse both frames
        // and skip the animation.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setFlights((prev) =>
              prev.map((f) => (f.id === id ? { ...f, landed: true } : f)),
            );
          });
        });
        window.setTimeout(() => {
          setFlights((prev) => prev.filter((f) => f.id !== id));
        }, DRAW_ANIMATION_MS + 50);
      }, startDelay);
    }
  }, [drawSeq, lastDrawCount]);
  // `battlefieldDisplayList` is hoisted to the layout section earlier
  // (needed by cellWidths / contentW / contentH) so both the card
  // render loop and the slot overlay resolve against the same source.

  // Parent → children map for attached cards on THIS player's battlefield.
  // `attachedChildrenByParent` is hoisted to the layout section
  // earlier — needed by `computeCellWidths` for attach-aware cell
  // widening. Reused here to fan children beside their parent.

  // Absolute (x, y) render position for every battlefield card, keyed by
  // BattlefieldCard.id. Parents get shifted right + down to make room for
  // their children; children fan diagonally left/up-under from the
  // parent. Skipped attached cards resolve normally (as if unattached)
  // if their parent isn't present on this battlefield — cross-player
  // attach or a race between events.
  const battlefieldPositions = (() => {
    const positions = new Map<string, { x: number; y: number }>();
    // Pass 1: non-attached cards. Parent-with-children get position
    // shifted right by (numChildren * stackOffsetX) and down by 15px so
    // the fanned children extend LEFT into empty space instead of
    // overlapping the parent. Ports `TableZone::reorganizeCards`.
    for (const c of battlefieldDisplayList) {
      if (
        c.attachTargetCardId != null &&
        c.attachTargetPlayerId === playerId
      ) {
        continue;
      }
      const displayRow = handOnTop
        ? BATTLEFIELD_ROWS - 1 - c.slot.row
        : c.slot.row;
      const origin = slotOriginPx(
        { row: displayRow, col: c.slot.col, subSlot: c.subSlot },
        cellWidths,
        battlefieldLayout,
      );
      const numChildren = attachedChildrenByParent.get(Number(c.id))?.length ?? 0;
      positions.set(c.id, {
        x: origin.x + numChildren * STACK_OFFSET_PX,
        y: origin.y + (numChildren > 0 ? 15 * scale : 0),
      });
    }
    // Pass 2: attached children. Position relative to the parent's
    // freshly-computed x/y. First child sits just left of the parent
    // (parent.x - offset), each subsequent child steps another offset
    // further left. Y sits 5px below the parent's base — matches
    // Cockatrice's `childY = y + 5`.
    for (const c of battlefieldDisplayList) {
      if (
        c.attachTargetCardId == null ||
        c.attachTargetPlayerId !== playerId
      ) {
        continue;
      }
      const parentPos = positions.get(String(c.attachTargetCardId));
      if (!parentPos) {
        // Parent not on this battlefield (cross-player attach or race);
        // fall back to slot origin so the child at least renders.
        const displayRow = handOnTop
          ? BATTLEFIELD_ROWS - 1 - c.slot.row
          : c.slot.row;
        const origin = slotOriginPx(
          { row: displayRow, col: c.slot.col, subSlot: c.subSlot },
          cellWidths,
          battlefieldLayout,
        );
        positions.set(c.id, { x: origin.x, y: origin.y });
        continue;
      }
      const siblings = attachedChildrenByParent.get(c.attachTargetCardId) ?? [];
      const idx = siblings.indexOf(c);
      // Reconstruct the PARENT'S row baseline (not the child's own).
      // Cockatrice's `childY = y + 5` uses the parent's mapped Y — an
      // attached card renders in the same row as its target regardless
      // of what slot the wire currently says the child is in. Without
      // this the child would stick to its original row when the parent
      // is elsewhere (see the "col matches but row doesn't" bug).
      const parent = battlefieldDisplayList.find(
        (bc) => Number(bc.id) === c.attachTargetCardId,
      );
      const parentRow = parent?.slot.row ?? c.slot.row;
      const displayRow = handOnTop
        ? BATTLEFIELD_ROWS - 1 - parentRow
        : parentRow;
      const rowY = rowTopY(displayRow, battlefieldLayout);
      positions.set(c.id, {
        x: parentPos.x - (idx + 1) * STACK_OFFSET_PX,
        y: rowY + 5 * scale,
      });
    }
    return positions;
  })();
  // Same "trust Redux in real games" rule as grave/exile above — see
  // that comment for the mock-id mismatch bug this avoids.
  const stackDisplayList = zones.stack.cards;

  // "Put top cards on stack until…": the dialog is a game dialog; the
  // reveal loop runs on this seat's stack (desktop moveOneCardUntil).
  const describeCard = useCallback((cardName: string): FilterableCard => {
    const meta = cardMetaByName.get(cardName);
    return {
      name: cardName,
      typeLine: meta?.typeLine,
      cmc: meta?.cmc,
      colors: meta?.colors,
      power: meta?.power,
      toughness: meta?.toughness,
    };
  }, [cardMetaByName]);
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

  // Shared pile-menu item arrays. Cockatrice's PlayerMenu shows the
  // full grave / exile / library menus as nested submenus of the
  // battlefield right-click; the same menus also live on each pile's
  // own right-click. Extracting to shared arrays keeps the two entry
  // points in lockstep — any change to a pile menu automatically
  // flows through to the battlefield submenu.
  //
  // Helper for the "Move <pile> to <target>" bulk-move click handlers
  // that grave/exile menus both use — enumerates every card in the
  // source pile (in stored bottom→top order, matching desktop) into a
  // single Command_MoveCard.
  const buildMoveAll = (
    source: 'graveyard' | 'exile',
    list: readonly HandCard[],
    startZone: ZoneNameValue,
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
  ): (() => void) => () => {
    if (list.length === 0) {
      return;
    }
    const cardIds = list.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    // `source` param is intentionally unused inside the wire (startZone
    // carries the wire name); it's a documentation hint for the caller.
    void source;
    zoneCommands.moveCards(startZone, cardIds, { zone: targetZone, index });
  };
  // "Reveal random card to..." submenu — used by grave. Same shape as
  // reveal-library: All players (playerId=-1) + separator + one row
  // per opponent. Disabled when the source pile is empty (Servatrice
  // returns RespContextError on empty-zone random reveals,
  // server_abstract_player.cpp:1504).
  const buildRevealRandomSubmenu = (
    zoneName: ZoneNameValue,
    zoneSize: number,
  ): ContextMenuItem[] =>
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () => zoneCommands.reveal(zoneName, toRecipient(-1), 'random'),
          disabled: zoneSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => zoneCommands.reveal(zoneName, toRecipient(t.playerId), 'random'),
          disabled: zoneSize <= 0,
        })),
      ]
      : [{ label: '(no players)' }];
  // Graveyard menu items — ported 1:1 from Cockatrice's GraveyardMenu
  // (grave_menu.cpp:14-36). Full self-view; opponent-view uses just
  // the "View graveyard" item below.
  const graveMenuItemsSelf: ContextMenuItem[] = [
    {
      label: 'View graveyard',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.GRAVE }),
      shortcut: shortcutHints['game.viewGraveyard'],
    },
    {
      label: 'Reveal random card to...',
      disabled: displayedGraveyardCount <= 0,
      submenu: buildRevealRandomSubmenu(ZoneName.GRAVE, displayedGraveyardCount),
    },
    { divider: true },
    {
      // "Move graveyard to..." — bulk move mirrors PileZoneLogic::moveAllToZone
      // (card_zone_logic.cpp:134-153).
      label: 'Move graveyard to...',
      disabled: displayedGraveyardCount <= 0,
      submenu: [
        {
          label: 'Top of library',
          onClick: buildMoveAll('graveyard', graveDisplayList, ZoneName.GRAVE, ZoneName.DECK, 0),
          disabled: displayedGraveyardCount <= 0,
        },
        {
          label: 'Bottom of library',
          onClick: buildMoveAll('graveyard', graveDisplayList, ZoneName.GRAVE, ZoneName.DECK, 'end'),
          disabled: displayedGraveyardCount <= 0,
        },
        { divider: true },
        {
          label: 'Hand',
          onClick: buildMoveAll('graveyard', graveDisplayList, ZoneName.GRAVE, ZoneName.HAND, 0),
          disabled: displayedGraveyardCount <= 0,
        },
        { divider: true },
        {
          label: 'Exile',
          onClick: buildMoveAll('graveyard', graveDisplayList, ZoneName.GRAVE, ZoneName.EXILE, 0),
          disabled: displayedGraveyardCount <= 0,
        },
      ],
    },
  ];
  const graveMenuItemsOpponent: ContextMenuItem[] = [
    {
      label: 'View graveyard',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.GRAVE }),
      disabled: displayedGraveyardCount <= 0,
    },
  ];
  // Exile menu items — ported 1:1 from Cockatrice's RfgMenu
  // (rfg_menu.cpp:9-28). Two deliberate omissions vs GraveyardMenu:
  // no "Reveal random card to..." submenu, and Move exile to... ends
  // at "Graveyard" (not a self "Exile" target).
  const exileMenuItemsSelf: ContextMenuItem[] = [
    {
      label: 'View exile',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.EXILE }),
    },
    { divider: true },
    {
      label: 'Move exile to...',
      disabled: displayedExileCount <= 0,
      submenu: [
        {
          label: 'Top of library',
          onClick: buildMoveAll('exile', exileDisplayList, ZoneName.EXILE, ZoneName.DECK, 0),
          disabled: displayedExileCount <= 0,
        },
        {
          label: 'Bottom of library',
          onClick: buildMoveAll('exile', exileDisplayList, ZoneName.EXILE, ZoneName.DECK, 'end'),
          disabled: displayedExileCount <= 0,
        },
        { divider: true },
        {
          label: 'Hand',
          onClick: buildMoveAll('exile', exileDisplayList, ZoneName.EXILE, ZoneName.HAND, 0),
          disabled: displayedExileCount <= 0,
        },
        { divider: true },
        {
          label: 'Graveyard',
          onClick: buildMoveAll('exile', exileDisplayList, ZoneName.EXILE, ZoneName.GRAVE, 0),
          disabled: displayedExileCount <= 0,
        },
      ],
    },
  ];
  const exileMenuItemsOpponent: ContextMenuItem[] = [
    {
      label: 'View exile',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.EXILE }),
      disabled: displayedExileCount <= 0,
    },
  ];

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

  const battlefieldDropRef = useSeatDropZone(`seat-${seatId}-battlefield`, {
    seatPlayerId: seatId,
    acceptsOtherSeats: true,
    priority: SEAT_DROP_PRIORITY.battlefield,
    // Snap the dragged card's top-left against this board's own columns, in
    // its visual orientation, then flip the row back to wire orientation on
    // a mirrored board.
    resolve: ({ cardOrigin }) => {
      const content = battlefieldRef.current;
      if (!content) {
        return null;
      }
      const rect = content.getBoundingClientRect();
      const snap = snapPxToSlot(cardOrigin.x - rect.left, cardOrigin.y - rect.top, cellWidths, battlefieldLayout);
      return {
        zone: 'battlefield',
        playerId: seatId,
        slot: { row: handOnTop ? BATTLEFIELD_ROWS - 1 - snap.row : snap.row, col: snap.col },
        grid: { rows: gridRows, cols: gridCols },
      };
    },
  });
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
  const battlefieldScrollRef = useForkRef(scrollContainerRef, battlefieldDropRef);
  const stackZoneRef = useForkRef(stackRef, stackDropRef);
  const handZoneRef = useForkRef(handRef, handDropRef);
  const libraryZoneRef = useForkRef(libraryRef, libraryDropRef);
  const graveyardZoneRef = useForkRef(graveyardRef, graveyardDropRef);
  const exileZoneRef = useForkRef(exileRef, exileDropRef);

  return {
    BATTLEFIELD_ROW_PADDING_PX,
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
    battlefieldLayout,
    battlefieldMenuItems,
    battlefieldPositions,
    battlefieldRef,
    battlefieldScrollRef,
    boxRef,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    cellWidths,
    closeSeatCardMenu,
    colsByRow,
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
    naturalContentH,
    naturalContentW,
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
