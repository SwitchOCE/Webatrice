import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useForkRef } from '@mui/material/utils';
import { motion } from 'motion/react';
import { Hand, Heart, Skull, Sparkles } from 'lucide-react';
import type { RoomMemberWithProfile, DeckCard } from './mockTypes';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { ManaSymbols } from './ManaSymbols';
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
  type BattlefieldSlot,
} from '../battlefield/Battlefield/battlefieldLayout';
import { legacyTableRowFromTypeLine, tableRowToGridY } from '../battlefield/Battlefield/cardPlacement';
import { MAX_SUBPOS } from '../battlefield/Battlefield/gridMath';
import { applyPTDelta, applyPTSet, parsePT } from '../context-menus/CardContextMenu/cardAttributeEdits';
import { buildCardContextMenu, type CardMenuItem } from '../context-menus/CardContextMenu/cardContextMenu.model';
import { CardMenuPopup } from '../context-menus/CardContextMenu/CardContextMenu';
import { buildRelatedTokenItems, buildTransformItems } from '../context-menus/CardContextMenu/relatedCardActions';
import {
  annotationPrompt,
  cardCounterPrompt,
  expressionPrompt,
  powerToughnessPrompt,
} from '../../hooks/dialogs/seatPrompts';
import type {
  BattlefieldCardViewModel,
  PlayerCardViewModel,
  PlayerZoneCommands,
  SeatMoveCard,
  SeatMoveDestination,
} from '../ui/PlayerBoard/playerBoard.types';
import { useCardScale } from './cardScale';
import { CardImage } from '@app/components';
import { usePreference, useSnapGridVisible } from '@app/hooks';
import {
  CARD_BACK_URL,
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_SIDEWAYS_HEIGHT,
  CARD_SIDEWAYS_WIDTH,
  CARD_WIDTH,
} from './cardSize';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import LibrarySearchDialog from './LibrarySearchDialog';
import Card from './Card';
import { deckCardImageUrl } from './deckCardImageUrl';
import { useCardPreviewActions } from '../ui/CardPreviewContext';
import { usePublishSeatShortcuts, type SeatShortcutOperations } from '../ui/SeatShortcutsContext';
import { useSeatSelection, type SeatSelection } from '../../hooks/useSeatSelection';
import { useCanActFor } from '../ui/CardVisualStateContext';
import { SEAT_DROP_PRIORITY, type SeatZone } from '../../hooks/seatDropPlan';
import {
  SeatDragGhost,
  SeatDropPreview,
  useActiveSeatDrag,
  useSeatDragSource,
  useSeatDropZone,
  type SeatDragStart,
} from '../ui/SeatDragContext';
import ZoneRevealDialog from './ZoneRevealDialog';
import { PlayerPlaymat } from '../PlayerPlaymat';
import { useGameDialogActions } from '../ui/GameDialogActionsContext';
import { useGameDialogsContext } from '../ui/GameDialogsContext';
import { useShortcutHints } from '@app/feature-widgets/shortcuts';
import { isFilterEmpty, matchCard, parseCardFilter, type CardFilter, type FilterableCard } from '../../utils/cardFilter';
import { buildArrowGeometry } from '../arrows/GameArrowOverlay/arrowPath';
import { ArrowColor, rgbaToCss } from '@app/types';
import {
  lookupCard,
  lookupCards,
  type LookupCardFace,
  type LookupResult,
  type RelatedCardRef,
} from '@app/services';

const DIALOG_SECONDARY_BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary '
  + 'hover:bg-bg-elevated transition-colors';
const DIALOG_INPUT_CLASS =
  'w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm '
  + 'text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';
const DIALOG_PRIMARY_BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-hover '
  + 'shadow-glow transition-colors';
const DIALOG_SUBMIT_BUTTON_CLASS =
  `${DIALOG_PRIMARY_BUTTON_CLASS} disabled:opacity-50 disabled:cursor-not-allowed`;

/** Seat card shapes. Owned by the PlayerBoard seat contract; the aliases keep
 *  this façade's local names until its regions move to PlayerBoard. */
export type HandCard = PlayerCardViewModel;
export type BattlefieldCard = BattlefieldCardViewModel;

/** Which zone a drag was initiated from. */
type DragSourceZone = SeatZone;

/** A marquee selection is always within a single zone. */
type Selection = SeatSelection;

const NO_CARDS: readonly HandCard[] = [];

/** Card counter letters by counter id (desktop's six counter slots). */
const COUNTER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** The cards a card prompt applies to, and the clicked card that seeds it. */
interface PromptTargets {
  targetIds: number[];
  cardName: string;
  current: string;
}

/** Synthetic drag payload for pulling the top of the library. The library
 *  is a HiddenZone — the client never knows which face is at deck[0]
 *  (that's the server's shuffle) so the drag carries no identity. The id
 *  is a non-numeric sentinel, which planSeatMove sends as position 0, the
 *  top of the deck (Cockatrice's HiddenZone convention). */
const LIBRARY_TOP_DRAG_PAYLOAD: HandCard = {
  id: '__library_top__',
  name: '',
  scryfallId: '',
};

/**
 * A single player's play-area box. Layout:
 *
 *   +-------+---------+--------------------+
 *   | Info  | CmdZone |                    |
 *   |       |         |    Battlefield     |
 *   |       | Stack   |                    |
 *   |       |         |                    |
 *   +       +---------+--------------------+
 *   |       |            Hand              |   (only for self)
 *   +-------+------------------------------+
 *
 * The info column spans both rows so the hand doesn't cut into it. Non-self
 * boxes skip the hand row entirely — opponents' hands are secret; only the
 * card count is shown in the info column.
 *
 * All zones are placeholders in this iteration — real card data lands with the
 * game-state wiring.
 */

type Props = {
  player: RoomMemberWithProfile;
  isSelf: boolean;
  /** True when it is this player's turn. Drives the accent border/glow
   *  around their box, so the whole table can see whose turn it is. */
  isActive: boolean;
  /** When true, the hand row sits above the play area instead of below.
   *  Used for players in the top row of a multi-row layout so their hand
   *  sits closer to the edge of the screen they're "facing". */
  handOnTop: boolean;
  /** When true, opponent hand card backs render rotated 180° — as if
   *  the opponent is holding them from their side of the table. On for
   *  layouts where opponents sit directly across (2 / 4+ player), off
   *  for 3-player where opponents are on the sides. No effect on the
   *  local (isSelf) hand. */
  flipHandCardBacks?: boolean;
  /** All cards from this player's selected deck. Feeds the library. */
  cards: DeckCard[];
  /** Optional controlled life counter. When provided, PlayerBox uses
   *  `value` as the displayed life total and calls `onDelta` for the
   *  hover +/- buttons and `onSet` for the numeric-edit input, instead
   *  of managing life via internal `useState`. Undefined during the
   *  pre-hydration transient before the player's counters are in
   *  Redux; PlayerBox falls back to a local-state life counter until
   *  it lands. */
  lifeControl?: {
    value: number;
    onDelta: (delta: number) => void;
    onSet: (value: number) => void;
  };
  /** Optional per-zone card counts sourced from Redux. When a value is
   *  present here, it overrides the local mock state's `.length` for
   *  that zone's displayed count badge — the actual local zone
   *  contents keep driving drag/drop behavior during this
   *  transitional wiring step. Undefined values fall through to the
   *  local mock counts (used during the pre-hydration transient
   *  before the zones land in Redux). */
  zoneCounts?: {
    deck?: number;
    grave?: number;
    rfg?: number;
    /** Hand card count from Redux. Set for BOTH self and opponents —
     *  own hand is a PrivateZone we can see fully, opponents' hands
     *  are private to them but the count is broadcast to everyone. */
    hand?: number;
  };
  /** Ordered graveyard/exile cards from Redux — used to drive the
   *  top-card art on each pile so it reflects the server's truth
   *  (correct card face for anyone at the table, including
   *  opponents). Empty arrays and undefined both fall back to the
   *  local pile — that covers the pre-hydration transient and the
   *  drop-to-ack window where a card is optimistically in the local
   *  pile before the server broadcasts it back. Last entry is the
   *  top. */
  graveCards?: readonly HandCard[];
  exileCards?: readonly HandCard[];
  /** Own sideboard cards from Redux — projected from
   *  `sideboardZone.revealedCards` (populated by Command_DumpZone).
   *  Sideboard is a HiddenZone so Servatrice sends only cardCount
   *  in the initial state (server_cardzone.cpp:343-361); we have
   *  to dump the zone to view its contents, same as View library. */
  sideboardCards?: readonly HandCard[];
  /** Fires `Command_DumpZone(zone=SIDEBOARD, numberCards=-1)` to
   *  request the sideboard contents. Called when the sideboard view
   *  modal opens. Response populates `sideboardZone.revealedCards`. */
  onDumpSideboard?: () => void;
  /** Clears the sideboard's `revealedCards` snapshot when the modal
   *  closes so a subsequent open re-dumps fresh. */
  onClearRevealedSideboard?: () => void;
  /** Own hand cards from Redux — drives the face-up hand row for
   *  isSelf and provides real numeric card ids for hand-source
   *  drag-drops. Only meaningful for the local player: opponents'
   *  hands are private to them, so their `handCards` array stays
   *  empty and their card-back count comes from `zoneCounts.hand`
   *  instead. Undefined during the pre-hydration transient — the
   *  local mock hand takes over as a fallback. */
  handCards?: readonly HandCard[];
  /** Battlefield cards from Redux (PublicZone — visible to every
   *  player). Includes slot (x/y) and tapped state. Drives the
   *  battlefield render for every seat and provides real numeric
   *  ids for battlefield-source drag-drops. Undefined during the
   *  pre-hydration transient — the local mock battlefield takes
   *  over as a fallback. */
  battlefieldCards?: readonly BattlefieldCard[];
  /** Stack cards from Redux (PublicZone — visible to every player).
   *  Order runs bottom → top of the stack (last-in resolves first,
   *  matching MTG's "last on the stack resolves first"). Drives the
   *  stack render and provides real numeric ids for stack-source
   *  drag-drops. */
  stackCards?: readonly HandCard[];
  /** Numeric Cockatrice player id for this seat (`onMoveCards` and the
   *  seat menus address it). `player.user_id` is a string
   *  (RoomMemberWithProfile carries the room-member id) so we can't
   *  reuse it for the wire command. */
  playerId?: number;
  /** Move cards between two of this seat's zones (zone port `moveCards`).
   *  Undefined only during the pre-hydration transient before the game id
   *  is known. */
  onMoveCards?: PlayerZoneCommands['moveCards'];
  /** Optional wires for library-management commands. When provided,
   *  they fire alongside the existing local mock mutations so the
   *  server drives the actual hand contents (via Redux) while the
   *  local library shuffle keeps the count and draw animation
   *  consistent. Undefined during the pre-hydration transient. */
  onDrawCards?: (number: number) => void;
  onMulligan?: (number: number) => void;
  onShuffle?: () => void;
  /** Fires `Command_Shuffle(zone=DECK, start, end)` for the "Shuffle
   *  top N" / "Shuffle bottom N" submenu items. Cockatrice encodes the
   *  range as `[0, N-1]` for top-N and `[-N, -1]` for bottom-N — negative
   *  indices count from the end (player_actions.cpp:265-269, 296-299).
   *  Server responds with Event_Shuffle (clears the zone's known-card
   *  tracking via clearZoneKnownCards). Undefined only during the
   *  pre-hydration transient. */
  onShuffleRange?: (start: number, end: number) => void;
  /** Webatrice-specific "Open deck in deck editor" action. Diverges
   *  from Cockatrice desktop (which reconstructs the deck in-app) —
   *  we navigate to the same `/deck/:id` page a My Decks row-click
   *  opens. Only wired when the game's deck matches a My Deck by
   *  name — undefined disables the menu item (foreign decks,
   *  .cod-upload path, or backendDecks not yet fetched). */
  onOpenDeckInEditor?: () => void;
  /** Fires `Command_RevealCards(zone=<zoneName>, player_id=<target or
   *  unset>, card_id=[-2])`. `-2` is Servatrice's `RANDOM_CARD_FROM_ZONE`
   *  sentinel (server_abstract_player.cpp:1498-1508) — server picks a
   *  random card from the zone. Powers the graveyard menu's "Reveal
   *  random card to..." submenu. `targetPlayerId === -1` reveals to
   *  every player. Mirrors PlayerActions::actRevealRandomGraveyardCard
   *  (player_actions.cpp:1750-1758). */
  onRevealRandomFromZone?: (zoneName: string, targetPlayerId: number) => void;
  /** Zone-agnostic variant of `onRevealLibrary` — fires
   *  `Command_RevealCards(zone=<zoneName>, player_id=<target or unset>)`
   *  with no `card_id` list (server reveals every card in the zone).
   *  Powers the hand menu's "Reveal hand to..." flow; long-term this
   *  can absorb `onRevealLibrary` once the library menu is retrofitted.
   *  Same proto2 field-presence trap as reveal-library — omit playerId
   *  when target is -1 (All players). */
  onRevealZone?: (zoneName: string, targetPlayerId: number) => void;
  /** Undo the last draw — server pops the most-recently-drawn card
   *  back onto the top of the library. Wraps `Command_UndoDraw` (no
   *  payload). Ports Cockatrice's `PlayerActions::actUndoDraw`
   *  (player_actions.cpp:371-374). */
  onUndoDraw?: () => void;
  /** Wraps `Command_DumpZone` for the DECK zone. `numberCards > 0`
   *  fetches that many; `isReversed=true` pulls from the bottom. The
   *  server response populates `zone.revealedCards`, which comes back
   *  via `revealedDeckCards`. Ports Cockatrice's `actViewTopCards`
   *  / `actViewBottomCards`. */
  onDumpTopCards?: (numberCards: number, isReversed: boolean) => void;
  /** Clears the DECK zone's `revealedCards` snapshot — called on
   *  dialog close so a subsequent view triggers a fresh dump. Matches
   *  Cockatrice's `zoneViewCleared` on ZoneViewWidget close. */
  onClearRevealedDeck?: () => void;
  /** Other seated players in the game (self excluded). Feeds the
   *  "Reveal library to..." / "Lend library to..." submenus. Order
   *  matches seating so the menu reads the same to all participants. */
  revealTargets?: readonly { playerId: number; name: string }[];
  /** Fires `Command_RevealCards(zone=DECK, player_id=<target or -1>)`.
   *  `targetPlayerId === -1` reveals to every player at the table.
   *  Mirrors Cockatrice's `PlayerActions::actRevealLibrary`
   *  (player_actions.cpp:1712-1721). */
  onRevealLibrary?: (targetPlayerId: number) => void;
  /** Fires `Command_RevealCards(zone=DECK, player_id=<target>,
   *  grant_write_access=true)`. Same wire as reveal but sets the
   *  write-access flag — Servatrice tracks a per-zone
   *  `playersWithWritePermission` set and lets the target execute
   *  Command_MoveCard against the lent zone
   *  (server_abstract_player.cpp:1566, cmdMoveCard validation :779).
   *  Permission clears on any shuffle of the zone
   *  (server_cardzone.cpp:72). Never called with -1 — the Lend menu
   *  doesn't offer "All players" (library_menu.cpp:280-293). */
  onLendLibrary?: (targetPlayerId: number) => void;
  /** Fires `Command_RevealCards(zone=DECK, player_id=<target or unset>,
   *  top_cards=<count>, card_id=[0])`. Server reveals the top N cards
   *  (positions 0..count-1) — face-up card list to the target /
   *  originator, count-only summary to spectators. `card_id=[0]` is a
   *  backward-compat sentinel Cockatrice desktop sends
   *  (player_actions.cpp:1745). Mirrors PlayerActions::actRevealTopCards
   *  (player_actions.cpp:1735-1748). `targetPlayerId === -1` reveals to
   *  every player at the table (menu offers "All players" per
   *  library_menu.cpp:295-314). */
  onRevealTopCards?: (targetPlayerId: number, count: number) => void;
  /** Current zone-property flags for the DECK. Drive the checked
   *  state of the "Always reveal / look at top card" toggles.
   *  Populated from Redux `zone.alwaysRevealTopCard` /
   *  `zone.alwaysLookAtTopCard`, which the zonePropertiesChanged
   *  reducer keeps in sync with server broadcasts. */
  alwaysRevealTopCard?: boolean;
  alwaysLookAtTopCard?: boolean;
  /** Toggle "always reveal top card of library" for THIS player's
   *  deck. Fires `Command_ChangeZoneProperties(zone=DECK,
   *  always_reveal_top_card=<value>)`. Server broadcasts the change
   *  via Event_ChangeZoneProperties AND immediately emits an
   *  Event_RevealCards (via revealTopCardIfNeeded,
   *  server_abstract_player.cpp:558-565) so all players see the
   *  current top card's face. Mirrors
   *  PlayerActions::actAlwaysRevealTopCard (player_actions.cpp:199). */
  onSetAlwaysRevealTopCard?: (value: boolean) => void;
  /** Toggle "always look at top card of library" for THIS player's
   *  deck. Fires `Command_ChangeZoneProperties(zone=DECK,
   *  always_look_at_top_card=<value>)`. Similar to always-reveal but
   *  the server emits Event_RevealCards ONLY to the owner
   *  (server_abstract_player.cpp:567-580) — other players just see a
   *  count-only Event_DumpZone. Mirrors
   *  PlayerActions::actAlwaysLookAtTopCard (player_actions.cpp:207). */
  onSetAlwaysLookAtTopCard?: (value: boolean) => void;
  /** The currently-known top card of the DECK (from
   *  Event_RevealCards fired by the server's revealTopCardIfNeeded
   *  hook). Populated only when this player has always-reveal or
   *  always-look-at on; other players see it only when this player
   *  has always-reveal on. Rendered face-up on the library pile in
   *  place of the card back. */
  deckTopCard?: { name: string; scryfallId: string } | null;
  /** DECK zone's `revealedCards` (populated by Response_DumpZone) as
   *  HandCards. Consumed by the "View top cards" flow to show the
   *  server-authoritative card faces in the search dialog. Empty when
   *  no dump is in flight or after it's been cleared. */
  revealedDeckCards?: readonly HandCard[];
  /** Set the tapped state of one or more battlefield cards. Fires on
   *  double-click; GameBoardCell dispatches one Command_SetCardAttr
   *  per card id. Multi-id calls happen when the double-clicked card
   *  is part of the current marquee selection. */
  onSetCardTapped?: (cardIds: number[], tapped: boolean) => void;
  /** Flip a battlefield card face-up or face-down. */
  onFlipCard?: (cardId: number, faceDown: boolean) => void;
  /** Peek at face-down battlefield cards — reveals each card to the
   *  local player only (owner-only in Cockatrice desktop; here we
   *  gate the menu item on `faceDown && isSelf`). Wire: one
   *  `Command_RevealCards` per card, `playerId` = local player.
   *  Bulk signature so a marquee'd selection peeks in one round-trip. */
  onPeekCards?: (cardIds: readonly number[]) => void;
  /** Toggle the "doesn't untap during untap step" attribute
   *  (`AttrDoesntUntap`). Fired by the "Skip untapping" context
   *  menu item. */
  onSetCardDoesntUntap?: (cardId: number, doesntUntap: boolean) => void;
  /** Create a token that copies a battlefield card. Fired by the
   *  "Clone" context menu item — mirrors Cockatrice's `cmClone`,
   *  which is `Command_CreateToken` with the source card's name,
   *  provider id, color, P/T and `destroy_on_zone_change: true`. */
  onCloneCard?: (source: {
    name: string;
    providerId: string;
    color: string;
    pt: string;
    annotation: string;
    y: number;
  }) => void;
  /** Set a card's annotation text via `Command_SetCardAttr` with
   *  `AttrAnnotation`. Empty value clears it. */
  onSetAnnotation?: (cardId: number, annotation: string) => void;
  /** Batch power/toughness update via `Command_SetCardAttr` with
   *  `AttrPT`. Wired to every entry in the "Power / toughness"
   *  submenu (Inc/Dec P, T, PT, flow, Set..., Reset). PlayerBox
   *  computes the new PT string per card using its local card
   *  metadata (Cockatrice-canonical format) and passes the pre-batched
   *  list; the wire dispatches one command per entry. */
  onSetPT?: (items: { cardId: number; pt: string }[]) => void;
  /** Fires one `Command_DeleteArrow` per arrow that THIS player created.
   *  Bound to Ctrl/Cmd+R (matches Cockatrice's "Remove Local Arrows"
   *  shortcut). Only ever invoked on the isSelf PlayerBox — deletes the
   *  local player's arrows, never opponents'. */
  onClearOwnArrows?: () => void;
  /** Fires a `Command_AttachCard` for the "Attach to card..." card
   *  context-menu flow. `sourceCardId` is the card the menu was opened
   *  on; `target` is where the user clicked to resolve the pending
   *  attach. Matches Cockatrice's `PlayerActions::actAttach` →
   *  `ArrowAttachItem` → `attachCards` path (arrow_item.cpp:288-391),
   *  minus the mid-drag arrow visual. */
  onAttachCard?: (
    sourceCardId: number,
    target: { playerId: number; cardId: number },
  ) => void;
  /** Detach a card from whatever it's currently attached to. Sends
   *  `Command_AttachCard` with only `startZone + cardId` (no target) —
   *  Servatrice interprets that as unattach and clears the source's
   *  `attachedTo` link. Ports `PlayerActions::actUnattach`. */
  onUnattachCard?: (sourceCardId: number) => void;
  /** Fires a `Command_CreateArrow` from the "Draw arrow..." card
   *  context-menu flow. Target is either a specific card or a player
   *  target (life pill). `sourceZone` is the wire zone name the source
   *  card lives in — TABLE for battlefield-card arrows, GRAVE / EXILE
   *  for arrows dragged from a pile-view modal. Matches Cockatrice's
   *  `PlayerActions::actDrawArrow` → `CardItem::drawArrow(Qt::red)`
   *  → `ArrowDragItem::mouseReleaseEvent` path (arrow_item.cpp:225-285). */
  onCreateArrow?: (
    sourceCardId: number,
    sourceZone: string,
    target:
      | { kind: 'card'; playerId: number; cardId: number }
      | { kind: 'player'; playerId: number },
  ) => void;
  /** Set an absolute counter value on a card. Wraps
   *  `Command_SetCardCounter { zone, cardId, counterId, counterValue }`
   *  — matches Cockatrice's `PlayerActions::offsetCardCounter` /
   *  `actSetCardCounter`. Server clamps to [0, MAX_COUNTER_VALUE] so
   *  callers can pass raw sums; we still clamp defensively here. */
  onSetCardCounter?: (
    cardId: number,
    counterId: number,
    value: number,
  ) => void;
  /** Server-authoritative mana pool for this player. Keyed by the
   *  color symbol (W/U/B/R/G/C) with the counter's server-assigned id
   *  and current count. Servatrice pre-creates all six on seat, so
   *  once the player is hydrated the object always has all keys. */
  manaCounters?: Partial<
    Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O', { id: number; count: number }>
  >;
  /** Dispatch a `Command_IncCounter` with a signed delta. Wired to
   *  left / right click on the mana pips (+1 / -1) and to the life
   *  counter's ±1 controls; only fires for isSelf. */
  onModifyCounter?: (counterId: number, delta: number) => void;
  /** Absolute-value variant — fires `Command_SetCounter` with a
   *  clamped `value`. Used by the mana pool's "Set counter..." rows
   *  in the battlefield Counters submenu. Life has its own bespoke
   *  wire via `lifeControl.onSet`. */
  onSetPlayerCounter?: (counterId: number, value: number) => void;
  /** Batched card-counter setter — packs every entry into a single
   *  CommandContainer, mirroring Cockatrice's per-batch atomicity
   *  in actIncrementAllCardCounters (player_actions.cpp:1618-1620).
   *  Each entry carries its own `(cardId, counterId, value)` since
   *  every card+counter combo bumps to a different target value. */
  onBulkSetCardCounters?: (
    entries: readonly {
      cardId: number;
      counterId: number;
      value: number;
    }[],
  ) => void;
  /** Fires `Command_SetCardAttr(zone=TABLE, cardId=-1, AttrTapped='0')`
   *  — Servatrice's "cardId=-1" sentinel means "apply to every card
   *  in the zone" (server_player.cpp Server_Card::setAttribute with
   *  allCards=true). One wire untaps the whole battlefield. Mirrors
   *  Cockatrice's actUntapAll (player_actions.cpp) which sends
   *  Command_SetCardAttr without a card_id. Also skips cards flagged
   *  with `doesntUntap` server-side (server_card.cpp:70). */
  onUntapAll?: () => void;
  /** Fires `Command_RollDie(sides=2, count=1)` — a coin flip is just
   *  a d2 in Cockatrice's protocol. Mirrors actFlipCoin
   *  (player_actions.cpp:866-872). Server broadcasts Event_RollDie
   *  and the chat log renders the result. */
  onFlipCoin?: () => void;
  /** Fires `Command_CreateToken` with the supplied token info. Wire
   *  computes y from a Dexie tablerow lookup so the token lands in
   *  the correct row (matches Cockatrice's actCreateAnotherToken —
   *  player_actions.cpp:894-916). "Create token..." opens the modal
   *  in this box and submits through this prop; "Create another token"
   *  re-fires with the last submitted args. */
  onCreateToken?: (args: {
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
    /** Set together to fire a transform (Cockatrice's
     *  Command_CreateToken with target_mode=TRANSFORM_INTO,
     *  player_actions.cpp:1198-1206). The new token is created in
     *  place of the target card — server-side effect is that the
     *  target flips to the specified new face. Used by the
     *  "Token: Transform into '<back-face>'" menu item on DFC
     *  cards. Both fields must be provided together to trigger
     *  transform mode; a bare providerId with no targetCardId
     *  still creates a plain new token. */
    targetCardId?: number;
    targetMode?: 'transform_into' | 'attach_to';
  }) => void;
  /** Draw beacon from Redux. Increments on every `Event_DrawCards` and
   *  is paired with `lastDrawCount` to describe how many cards the last
   *  draw delivered. Watched by the library→hand flight animation so it
   *  fires ONLY for real draws (Command_DrawCards / Command_Mulligan)
   *  and not for zone→hand drags or reveal-to-hand paths. */
  drawSeq?: number;
  lastDrawCount?: number;
};

/** Where a marquee started — one of the three selectable zones. A single
 *  marquee never bridges zones; for battlefield, the owning player id is
 *  part of the identity so different battlefields count as different
 *  zones. */
type MarqueeStartZone =
  | { zone: 'battlefield'; ownerId: string }
  | { zone: 'hand' }
  | { zone: 'stack' };

/** Imperative handle exposed by every PlayerBox so a sibling box (via
 *  Battlefield's ref map) can push cards into this player's battlefield,
 *  highlight this player's battlefield cards as part of the viewer's
 *  cross-player marquee, or hand off a marquee-start event. */
export type PlayerBoxHandle = {
  receiveBattlefieldCards: (
    cards: HandCard[],
    intendedSlots: BattlefieldSlot[],
  ) => void;
  /** Begin a marquee from the given viewport coordinates. Non-self
   *  PlayerBoxes call this via the Battlefield router so the viewer's
   *  marquee can start over any player's board — including opponents'
   *  battlefields, which the viewer can select-highlight but not drag. */
  startMarquee: (x: number, y: number) => void;
};

const MANA_COLORS: Array<{
  symbol: 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O';
  label: string;
  tint: string;
}> = [
  { symbol: 'W', label: 'White', tint: '#f9f1c8' },
  { symbol: 'U', label: 'Blue', tint: '#3b82f6' },
  { symbol: 'B', label: 'Black', tint: '#4b5563' },
  { symbol: 'R', label: 'Red', tint: '#ef4444' },
  { symbol: 'G', label: 'Green', tint: '#10b981' },
  { symbol: 'C', label: 'Colorless', tint: '#9ca3af' },
  // 7th slot — Cockatrice's server pre-creates a "storm" counter
  // (id=7) with orange makeColor(255, 150, 30) at server_player.cpp:102;
  // the desktop UI labels it "Other" and slots it after the colorless
  // pip. We mirror both the position and the tint so muscle memory
  // carries over.
  { symbol: 'O', label: 'Other', tint: '#f97316' },
];

/**
 * Non-interactive overlay: dashed outline at every snap slot + the divider
 * marking the lands row. Grid is measured by the parent so slot outlines
 * line up exactly with cards rendered in the same layer.
 *
 * When `mirrored`, the vertical layout is flipped so top-row players (as
 * seen from the viewer sitting at the bottom) render "facing" the viewer:
 * their state row 0 sits at the visual bottom, their lands row (max row)
 * sits at the visual top near their hand.
 */
function BattlefieldSlotOverlay({
  cellWidths,
  colsByRow,
  layout,
  mirrored,
  highlightedSlot,
}: {
  cellWidths: ReturnType<typeof computeCellWidths>;
  /** Per-row column count (inclusive) to render outlines for. Rows with
   *  fewer occupied columns still fill up to the min-cols count so an
   *  empty battlefield shows a dashed grid of drop targets. */
  colsByRow: readonly number[];
  layout: BattlefieldLayoutOpts;
  mirrored: boolean;
  /** Slot the current drag would snap to on this battlefield (display
   *  coord — post-mirror). When set, that specific cell paints an
   *  accent-tinted background as a drop-preview cue. `null` = no drop
   *  landing here right now (either no active drag, or the drag is
   *  aimed at a different zone / player's board). */
  highlightedSlot?: { row: number; col: number } | null;
}) {
  // Global toggle from the header — off by default (matches the "no
  // noisy grid" default) but the user can flip it on to see snap slots
  // when eyeballing layout.
  const showBorders = useSnapGridVisible();
  const rows = layout.rows ?? BATTLEFIELD_ROWS;
  const slots: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const cols = colsByRow[row];
    for (let col = 0; col < cols; col++) {
      slots.push({ row, col });
    }
  }
  return (
    <div className="absolute inset-0 pointer-events-none">
      {slots.map((slot) => {
        // Matches Cockatrice desktop's default (invertVerticalCoordinate
        // stays false). Wire y=0 (CREATURES per `oracleimporter.cpp` +
        // `tableRowToGridY`) renders at container top for the owner
        // (facing the opponent), y=2 (LANDS) at container bottom near
        // the owner's hand. Opponent boards flip via `mirrored` so
        // their creatures still face our creatures at center and their
        // lands sit near their own hand at the top of the screen.
        const displayRow = mirrored ? rows - 1 - slot.row : slot.row;
        const { x, y } = slotOriginPx(
          { row: displayRow, col: slot.col, subSlot: 0 },
          cellWidths,
          layout,
        );
        // Highlight comparison happens in DISPLAY coord (both slot.row
        // pre-mirror and highlightedSlot.row post-mirror sit in display
        // space here, since we render at displayRow above).
        const isHighlighted =
          highlightedSlot != null &&
          highlightedSlot.row === displayRow &&
          highlightedSlot.col === slot.col;
        return (
          <div
            key={`${slot.row}-${slot.col}`}
            data-drop-preview={isHighlighted || undefined}
            // Dashed border toggled by the header "Snap grid" button
            // (useSnapGridVisible). Off by default; on = dashed outline
            // at every snap position so the user can eyeball layout.
            // Highlighted slot always shows — accent background so the
            // user sees where their dragged card will land.
            className={[
              'absolute',
              showBorders && !isHighlighted && 'border border-dashed border-border-strong/40',
              isHighlighted && 'bg-accent/25 ring-2 ring-accent/60 ring-inset',
            ].filter(Boolean).join(' ')}
            style={{
              width: `${layout.cardWidthPx}px`,
              height: `${layout.cardHeightPx}px`,
              left: `${x}px`,
              top: `${y}px`,
              borderRadius: CARD_CORNER_RADIUS,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Full-size zone box matching the Library footprint but WITHOUT the card back
 * image — for zones like Graveyard and Exile where a face-down card isn't the
 * right metaphor. Icon sits as a subtle watermark; count centered on top.
 *
 * Accepts a ref + onPointerDown so it can serve as both a drag source (grab
 * the top card) and a drop target (hit-testing uses the forwarded ref).
 */
const LargeZoneBox = forwardRef<
  HTMLDivElement,
  {
    icon: typeof Heart;
    label: string;
    count: number;
    /** Top card of the pile — its art fills the box so the zone visually
     *  represents what's on top of the physical pile. Null when empty. */
    topCard?: { name: string; scryfallId: string } | null;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    /** Wire owner + zone name, applied as `data-arrow-anchor-*` attrs
     *  so the arrow overlay can anchor arrows to the whole pile when
     *  the specific source card element isn't in the DOM (typical for
     *  arrows drawn from a grave / exile card — the card lives inside
     *  a portal-rendered pile-view modal that findCardEl can't reach,
     *  or the modal is closed entirely). See useGameArrowOverlay's
     *  `findCardEl` fallback path. */
    arrowAnchorPlayerId?: number;
    arrowAnchorZone?: string;
      }
      >(function LargeZoneBox(
        {
          icon: Icon,
          label,
          count,
          topCard,
          onPointerDown,
          arrowAnchorPlayerId,
          arrowAnchorZone,
        },
        ref,
      ) {
        const draggable = !!onPointerDown;
        const { setHoveredCard } = useCardPreviewActions();
        return (
          <div className="flex justify-center">
            <div
              ref={ref}
              data-drag-source
              data-arrow-anchor-owner={
                arrowAnchorPlayerId != null ? String(arrowAnchorPlayerId) : undefined
              }
              data-arrow-anchor-zone={arrowAnchorZone}
              onPointerDown={onPointerDown}
              onMouseEnter={topCard ? () => setHoveredCard(topCard) : undefined}
              className="relative rounded-md border border-border-subtle bg-bg-base/60 overflow-hidden select-none"
              style={{
                width: CARD_SIDEWAYS_WIDTH,
                height: CARD_SIDEWAYS_HEIGHT,
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
              }}
              title={
                topCard ? `${label} — ${count} (top: ${topCard.name})` : `${label} — ${count}`
              }
            >
              {topCard && (
                <CardImage
                  // Mirror Card.tsx's fallback: Servatrice's Event_MoveCard
                  // populates `new_card_provider_id` from the server-side card
                  // DB (server_abstract_player.cpp:470,500), which returns
                  // empty for cards not in Servatrice's cards.xml — hitting
                  // `/cards/<empty>` returns 404 → broken image. Fall back to
                  // `/cards/named?exact=<name>` so the graveyard/exile pile
                  // still shows real art when only the name is known.
                  src={
                    topCard.scryfallId
                      ? `https://api.scryfall.com/cards/${topCard.scryfallId}?format=image&version=large`
                      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(topCard.name)}&format=image&version=large`
                  }
                  name={topCard.name}
                  draggable={false}
                  className="pointer-events-none select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    borderRadius: CARD_CORNER_RADIUS,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-[0.35em] pointer-events-none">
                {!topCard && <Icon size="2.5em" className="text-text-muted shrink-0" />}
                <span
                  className="text-white font-modern font-bold tabular-nums text-[3em]"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
                >
                  {count}
                </span>
              </div>
            </div>
          </div>
        );
      });

/**
 * Face-down sideways card representing a zone stack (library, hand, …).
 * Card back image rotated -90°, with a big count centered on top.
 */
const CardBackZone = forwardRef<
  HTMLDivElement,
  {
    label: string;
    count: number;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    /** When set, the pile renders the given card FACE UP in place of
     *  the card back. Drives the "Always reveal top card" /
     *  "Always look at top card" visualization — Cockatrice's
     *  desktop pile paints the top card face when the corresponding
     *  toggle is on (pile_zone.cpp:47-60). GameBoardCell only
     *  supplies this when the appropriate zone-property flag is
     *  active for the viewer. */
    topCard?: { name: string; scryfallId: string } | null;
      }
      >(function CardBackZone({ label, count, onPointerDown, topCard }, ref) {
        const draggable = !!onPointerDown;
        return (
          <div className="flex justify-center">
            <div
              ref={ref}
              data-drag-source
              onPointerDown={onPointerDown}
              className="relative rounded-md overflow-hidden border border-border-strong shadow-inner select-none"
              style={{
                width: CARD_SIDEWAYS_WIDTH,
                height: CARD_SIDEWAYS_HEIGHT,
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
              }}
              title={topCard ? `${label} — ${count} (top: ${topCard.name})` : `${label} — ${count}`}
            >
              {topCard ? (
              // Face-up top card via the shared Card renderer (which reads
              // scryfallId / name → art URL). Rotated -90° to match the
              // sideways-pile layout of the card back below. Deliberately
              // NOT pointer-events-none — Card's onMouseEnter needs to
              // fire so the right-rail preview picks up the hovered face.
              // Pile-drag pointerdown still bubbles up to the parent
              // container's handler.
                <div
                  className="select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                >
                  <Card name={topCard.name} scryfallId={topCard.scryfallId} />
                </div>
              ) : (
                <img
                  src={CARD_BACK_URL}
                  alt=""
                  draggable={false}
                  className="pointer-events-none select-none absolute top-1/2 left-1/2"
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    // ~7.5% of the card width matches the real MTG corner curve and
                    // hides the white JPG background showing through the rounded card
                    // corners without eating into meaningful art.
                    borderRadius: CARD_CORNER_RADIUS,
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                />
              )}
              {/* Dimming overlay sits behind the count number so the big
            white digits stay readable against the busy card-back art.
            Skipped when a top card is showing — Cockatrice desktop
            renders that face fully un-dimmed, matching the visual
            expectation of a face-up card. */}
              {!topCard && (
                <div className="absolute inset-0 bg-black/20 pointer-events-none" aria-hidden />
              )}
              <div
                className={[
                  'absolute inset-0 flex items-center justify-center text-white',
                  'font-modern font-bold tabular-nums text-[3em] pointer-events-none',
                ].join(' ')}
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
              >
                {count}
              </div>
            </div>
          </div>
        );
      }
      );

/** Mirrors Cockatrice desktop's `actRequestViewTopCardsDialog`
 *  / `actRequestViewBottomCardsDialog` (player_actions.cpp:177-197):
 *  prompts for how many cards from the top/bottom of the library to
 *  reveal. Submit fires `Command_DumpZone(zone=DECK, numberCards=N,
 *  isReversed)` and the server response populates `revealedCards`. */
function ViewNCardsModal({
  isReversed,
  deckSize,
  initial,
  onCancel,
  onConfirm,
  titleOverride,
  submitLabel,
}: {
  isReversed: boolean;
  deckSize: number;
  initial: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
  /** Optional title override. When set, wins over the isReversed-derived
   *  default — useful for the "Reveal top cards to <player>" flow which
   *  shares this modal but wants "Reveal top N of library to Bob". */
  titleOverride?: string;
  /** Optional submit-button label. Defaults to "View" for the original
   *  view-top / view-bottom flow. The Top/Bottom-of-library submenus
   *  (Move N to grave/exile, Draw bottom N, Shuffle top/bottom N) reuse
   *  this modal with verb-appropriate labels ("Move", "Draw", "Shuffle"). */
  submitLabel?: string;
}) {
  const [draft, setDraft] = useState(String(initial));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const parsed = parseInt(draft, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  const title = titleOverride ??
    (isReversed
      ? 'View bottom cards of library'
      : 'View top cards of library');
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            {title}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Library size: {Math.max(0, deckSize)}
          </p>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              return;
            }
            const clamped = Math.min(parsed, Math.max(0, deckSize));
            if (clamped <= 0) {
              return;
            }
            onConfirm(clamped);
          }}
        >
          <label className="text-xs text-text-secondary">
            Number of cards
          </label>
          <input
            autoFocus
            type="number"
            min={1}
            max={Math.max(1, deckSize)}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className={DIALOG_INPUT_CLASS}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={DIALOG_SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || deckSize <= 0}
              className={DIALOG_SUBMIT_BUTTON_CLASS}
            >
              {submitLabel ?? 'View'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Cockatrice's `DlgMoveTopCardsUntil`. Reveals library cards from
 *  the top one at a time, moving each to the stack, until N cards
 *  matching the name are found (or the library runs out). Optional
 *  auto-play plays each matched card. Simplified from Cockatrice:
 *  match is a case-insensitive substring of the card name (Cockatrice
 *  supports a filter DSL — MVP just does name match). */
function MoveTopUntilModal({
  deckSize,
  onCancel,
  onConfirm,
}: {
  deckSize: number;
  onCancel: () => void;
  onConfirm: (args: { filter: string; hits: number; autoPlay: boolean }) => void;
}) {
  const [filter, setFilter] = useState('');
  const [hitsDraft, setHitsDraft] = useState('1');
  const [autoPlay, setAutoPlay] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const parsedHits = parseInt(hitsDraft, 10);
  const validHits = Number.isFinite(parsedHits) && parsedHits >= 1 && parsedHits <= 99;
  const validFilter = filter.trim().length > 0;
  const canSubmit = validHits && validFilter && deckSize > 0;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Put top cards on stack until"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            Put top cards on stack until…
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Library size: {Math.max(0, deckSize)}
          </p>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) {
              return;
            }
            onConfirm({ filter: filter.trim(), hits: parsedHits, autoPlay });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              Card name (or search expressions)
            </label>
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={[
                'w-full bg-bg-base border border-border-subtle rounded-md',
                'px-3 py-2 text-sm text-text-primary',
                'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
              ].join(' ')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Number of hits</label>
            <input
              type="number"
              min={1}
              max={99}
              step={1}
              value={hitsDraft}
              onChange={(e) => setHitsDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className={[
                'w-full bg-bg-base border border-border-subtle rounded-md',
                'px-3 py-2 text-sm text-text-primary',
                'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
              ].join(' ')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            Auto play hits
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-base transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={DIALOG_SUBMIT_BUTTON_CLASS}
            >
              Start
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Mirrors Cockatrice desktop's `actRequestDrawCardsDialog`
 *  (player_actions.cpp:356-361): prompts for how many cards to draw
 *  from the top of the library. Submit sends Command_DrawCards with
 *  the entered number. Escape cancels; Enter submits. */
function DrawCardsModal({
  deckSize,
  initial,
  onCancel,
  onConfirm,
}: {
  deckSize: number;
  initial: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(initial));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const parsed = parseInt(draft, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Draw cards"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            Draw cards
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Library size: {Math.max(0, deckSize)}
          </p>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              return;
            }
            // Clamp to library size — Cockatrice's server also clamps,
            // but showing the clamped intent here avoids a "why did I
            // only draw 5 when I asked for 100" surprise.
            const clamped = Math.min(parsed, Math.max(0, deckSize));
            if (clamped <= 0) {
              return;
            }
            onConfirm(clamped);
          }}
        >
          <label className="text-xs text-text-secondary">
            Number of cards
          </label>
          <input
            autoFocus
            type="number"
            min={1}
            max={Math.max(1, deckSize)}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className={DIALOG_INPUT_CLASS}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={DIALOG_SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || deckSize <= 0}
              className={DIALOG_SUBMIT_BUTTON_CLASS}
            >
              Draw
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Tailwind port of Cockatrice's `DlgCreateToken` (dlg_create_token.cpp),
 *  invoked from actRequestCreateTokenDialog. Collects the free-form
 *  token identity fields; the parent snapshots the result into
 *  lastToken so "Create another token" can re-fire without reprompting
 *  (matches actCreateToken → actCreateAnotherToken flow,
 *  player_actions.cpp:878-916). Predefined-token chooser is intentionally
 *  omitted — that's a separate menu item still gated off. */
const CREATE_TOKEN_COLOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'w', label: 'White' },
  { value: 'u', label: 'Blue' },
  { value: 'b', label: 'Black' },
  { value: 'r', label: 'Red' },
  { value: 'g', label: 'Green' },
  { value: 'm', label: 'Multicolor' },
  { value: '', label: 'Colorless' },
];

// Server-side MAX_NAME_LENGTH is 0xff; free-text fields mirror that so
// the payload never trips the server's oversize rejection.
const CREATE_TOKEN_MAX_LEN = 255;

const CREATE_TOKEN_INPUT_CLASS =
  'w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm '
  + 'text-text-primary focus:outline-none focus:border-accent focus:ring-1 '
  + 'focus:ring-accent disabled:opacity-50';

function CreateTokenModal({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: {
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
  } | null;
  onCancel: () => void;
  onConfirm: (args: {
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? 'w');
  const [pt, setPT] = useState(initial?.pt ?? '');
  const [annotation, setAnnotation] = useState(initial?.annotation ?? '');
  const [destroyOnZoneChange, setDestroyOnZoneChange] = useState(
    initial?.destroyOnZoneChange ?? true,
  );
  const [faceDown, setFaceDown] = useState(initial?.faceDown ?? false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const trimmed = name.trim();
  const valid = trimmed.length > 0;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create token"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            Create token
          </h2>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              return;
            }
            const payload = {
              name: trimmed,
              color,
              pt: pt.trim(),
              annotation: annotation.trim(),
              destroyOnZoneChange,
              faceDown,
              ...(initial?.providerId && initial.name === trimmed
                ? { providerId: initial.providerId }
                : {}),
            };
            onConfirm(payload);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Name</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, CREATE_TOKEN_MAX_LEN))}
              disabled={faceDown}
              className={CREATE_TOKEN_INPUT_CLASS}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-text-secondary">Color</span>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={faceDown}
                className={CREATE_TOKEN_INPUT_CLASS + ' appearance-none'}
              >
                {CREATE_TOKEN_COLOR_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-text-secondary">Power / toughness</span>
              <input
                type="text"
                placeholder="e.g. 3/3"
                value={pt}
                onChange={(e) => setPT(e.target.value.slice(0, CREATE_TOKEN_MAX_LEN))}
                disabled={faceDown}
                className={CREATE_TOKEN_INPUT_CLASS}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Annotation</span>
            <input
              type="text"
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value.slice(0, CREATE_TOKEN_MAX_LEN))}
              className={CREATE_TOKEN_INPUT_CLASS}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-text-primary select-none">
            <input
              type="checkbox"
              checked={destroyOnZoneChange}
              onChange={(e) => setDestroyOnZoneChange(e.target.checked)}
              className="accent-accent"
            />
            Destroy when it leaves the table
          </label>
          <label className="flex items-center gap-2 text-sm text-text-primary select-none">
            <input
              type="checkbox"
              checked={faceDown}
              onChange={(e) => setFaceDown(e.target.checked)}
              className="accent-accent"
            />
            Create face-down
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className={
                'px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary '
                + 'hover:text-text-primary hover:bg-bg-elevated transition-colors'
              }
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              className={
                'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white '
                + 'hover:bg-accent-hover shadow-glow transition-colors '
                + 'disabled:opacity-50 disabled:cursor-not-allowed'
              }
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Mirrors Cockatrice desktop's `actRequestMoveCardXCardsFromTopDialog`
 *  (player_actions.cpp:1220-1225): prompts for how many cards from the
 *  top of the library to place the source card behind. Submit sends
 *  Command_MoveCard with x=N so the card lands at position N in the
 *  deck (0 = top, deckSize = bottom). Escape cancels; Enter submits. */
function MoveXCardsFromTopModal({
  cardName,
  deckSize,
  initial,
  onCancel,
  onConfirm,
}: {
  cardName: string;
  deckSize: number;
  initial: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}) {
  // Track as string so partial edits ("", "-") don't fight the input.
  // Clamped on submit.
  const [draft, setDraft] = useState(String(initial));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const parsed = parseInt(draft, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Move X cards from the top of library"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            Move X cards from the top of library
          </h2>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {cardName}
          </p>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              return;
            }
            // Clamp to library size — Cockatrice does the same at
            // actMoveCardXCardsFromTop (`if number > maxCards → maxCards`).
            const clamped = Math.min(parsed, Math.max(0, deckSize));
            onConfirm(clamped);
          }}
        >
          <label className="text-xs text-text-secondary">
            Place at position (0 = top, {Math.max(0, deckSize)} = bottom)
          </label>
          <input
            autoFocus
            type="number"
            min={0}
            max={Math.max(0, deckSize)}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className={DIALOG_INPUT_CLASS}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={DIALOG_SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              className={DIALOG_SUBMIT_BUTTON_CLASS}
            >
              Move
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManaPip({
  symbol,
  label,
  count,
  tint,
  onIncrement,
  onDecrement,
}: {
  symbol: string;
  label: string;
  count: number;
  tint: string;
  /** Left-click handler. When present the pip becomes clickable and
   *  fires the Cockatrice canonical ±1 counter change on the server. */
  onIncrement?: () => void;
  /** Right-click handler; suppresses the browser context menu. */
  onDecrement?: () => void;
}) {
  const clickable = !!onIncrement || !!onDecrement;
  // Standard MTG mana symbols Scryfall has SVGs for at
  // https://svgs.scryfall.io/card-symbols/<X>.svg. The "Other" pool
  // slot (O → Cockatrice's `storm` counter) isn't a real mana symbol
  // and 404s from Scryfall; render a solid tinted circle for those
  // instead so we don't ship a broken-image icon.
  const hasScryfallSvg = /^[WUBRGCX]$/.test(symbol);
  // Pip size dropped from fancy's 2.75em to 2em so the 3-wide grid
  // fits inside the compact info column without widening it.
  return (
    <div
      className="relative"
      style={{
        width: '2em',
        height: '2em',
        cursor: clickable ? 'pointer' : undefined,
      }}
      title={label}
      role={clickable ? 'button' : undefined}
      onClick={onIncrement}
      onContextMenu={
        onDecrement
          ? (e) => {
            e.preventDefault();
            onDecrement();
          }
          : undefined
      }
    >
      {hasScryfallSvg ? (
        <ManaSymbols cost={`{${symbol}}`} size="2em" />
      ) : (
        // Solid tinted disc for symbols without a Scryfall SVG (e.g.
        // "O" = Cockatrice's Other/storm). Full-opacity fill with a
        // subtle dark ring reads as "physical pip" without needing
        // the ManaSymbols SVG underneath.
        <div
          className="absolute inset-0 rounded-full pointer-events-none border border-black/50"
          style={{ backgroundColor: tint }}
        />
      )}
      {/* 50% color wash sitting on top of the pip. Skipped for pips
          that already have a full-opacity disc (see above) so their
          color isn't washed out to 50%. */}
      {hasScryfallSvg && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ backgroundColor: tint, opacity: 0.5 }}
        />
      )}
      <span
        className="absolute inset-0 flex items-center justify-center text-white font-bold text-[0.75em] tabular-nums pointer-events-none"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)' }}
      >
        {count}
      </span>
    </div>
  );
}

function PlayerBox(
  {
    player,
    isSelf,
    isActive,
    handOnTop,
    flipHandCardBacks = false,
    cards,
    lifeControl,
    zoneCounts,
    graveCards,
    exileCards,
    sideboardCards,
    onDumpSideboard,
    onClearRevealedSideboard,
    handCards,
    battlefieldCards,
    stackCards,
    playerId,
    onMoveCards,
    onDrawCards,
    onMulligan,
    onShuffle,
    onShuffleRange,
    onOpenDeckInEditor,
    onRevealRandomFromZone,
    onRevealZone,
    onUndoDraw,
    onDumpTopCards,
    onClearRevealedDeck,
    revealedDeckCards,
    revealTargets,
    onRevealLibrary,
    onLendLibrary,
    onRevealTopCards,
    alwaysRevealTopCard,
    alwaysLookAtTopCard,
    onSetAlwaysRevealTopCard,
    onSetAlwaysLookAtTopCard,
    deckTopCard,
    onSetCardTapped,
    onFlipCard,
    onPeekCards,
    onSetCardDoesntUntap,
    onCloneCard,
    onSetAnnotation,
    onSetPT,
    onClearOwnArrows,
    onAttachCard,
    onUnattachCard,
    onCreateArrow,
    manaCounters,
    onModifyCounter,
    onSetPlayerCounter,
    onBulkSetCardCounters,
    onUntapAll,
    onFlipCoin,
    onCreateToken,
    drawSeq,
    lastDrawCount,
  }: Props,
  ref: React.Ref<PlayerBoxHandle>,
) {
  const name = player.profile?.display_name ?? player.profile?.username ?? 'Unknown';
  // Dialog-opening actions surfaced by the game-level provider. Used
  // by the battlefield right-click menu to fire the same Roll die /
  // Game info flows the sidebar buttons already trigger.
  const {
    onRequestRollDie,
    onRequestGameInfo,
    onRequestViewSideboard,
  } = useGameDialogActions();
  // User-interface preferences (Settings → User Interface).
  const playToStack = usePreference('playToStack');
  const tapAnimation = usePreference('tapAnimation');
  // Sideboard view state — mounted below in the modal render block
  // when isSelf. Both open triggers (right-sidebar button + battlefield
  // menu) dispatch through useGameDialogActions so this is the single
  // source of truth.
  const {
    viewSideboardOpen,
    closeViewSideboard,
    // Trigger flags flipped by the F3/F4 shortcuts (and the sidebar,
    // eventually). PlayerBox is where the actual LibrarySearchDialog /
    // pileView state lives, so external triggers just set a boolean
    // here and we open the local dialog + clear the trigger.
    viewLibraryOpen,
    closeViewLibrary,
    viewGraveyardOpen,
    closeViewGraveyard,
    // Hand-menu handlers already wired at the dialog layer — used by
    // handMenuItems below so the button-triggered menu isn't full of
    // disabled placeholders. `handleRequestSortHandBy` fires per-card
    // moveCard dispatches (hand_menu.cpp parity),
    // `handleRequestChooseMulligan` opens a numeric prompt then
    // dispatches Command_Mulligan. "View hand" reuses the local
    // LibrarySearchDialog via `pileView` instead of the dialog-layer
    // handler so we get the same search / group / sort / pile-view
    // controls as the graveyard / exile viewers, plus drag-in and
    // drag-out support against the HAND zone.
    handleRequestSortHandBy,
    handleRequestChooseMulligan,
    seatCardMenu,
    openSeatCardMenu,
    closeSeatCardMenu,
    openPrompt,
  } = useGameDialogsContext();
  // Fire Command_DumpZone(zone=SIDEBOARD) each time the modal opens.
  // Same pattern as View library: sideboard is a HiddenZone so we
  // don't have `byId`/`order` locally without a dump. Owner-only.
  useEffect(() => {
    if (isSelf && viewSideboardOpen) {
      onDumpSideboard?.();
    }
  }, [isSelf, viewSideboardOpen, onDumpSideboard]);

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
    if (!isSelf || cards.length === 0) {
      return;
    }
    for (const c of cards) {
      if (c.category === 'sideboard') {
        continue;
      }
      const img = new Image();
      img.src = deckCardImageUrl(c);
    }
  }, [isSelf, cards]);

  // Prefetch every deck card's metadata (`type_line` for hand
  // double-click auto-routing + `power`/`toughness` for the P/T pill
  // on the battlefield). The .cod XML we upload doesn't carry either,
  // so we backfill from the Dexie card DB (Cockatrice XML import) and
  // fall back to Scryfall on miss. Cached by card name because that's
  // what both consumers have cheaply available.
  // Card metadata cache keyed by name. Consumed by:
  //   • Battlefield P/T pills (typeLine + pt).
  //   • Card context menu's currentPT fallback.
  //   • LibrarySearchDialog (backfills type_line / cmc / colors / power /
  //     toughness on DeckCards whose .cod source didn't ship metadata).
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
    if (!isSelf || cards.length === 0) {
      return;
    }
    let cancelled = false;
    // Include sideboard cards in the Scryfall metadata fetch —
    // the sideboard viewer's Group by Type / Sort by CMC / etc.
    // dropdowns need the same enrichment as the main deck view.
    // Sideboard cards were previously filtered out under the
    // assumption they wouldn't be inspected in-game.
    const uniqueNames = Array.from(
      new Set(cards.map((c) => c.name)),
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
  }, [isSelf, cards]);

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
    if (!battlefieldCards || battlefieldCards.length === 0) {
      return;
    }
    let cancelled = false;
    const uniqueNames = Array.from(
      new Set(battlefieldCards.map((c) => c.name)),
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
  }, [battlefieldCards]);

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

  const deckCount = zoneCounts?.deck ?? 0;

  // Refs for measuring the library card and hand zone positions so we can
  // animate a card back travelling between them.
  const libraryRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  // Ref to the search-library dialog while open. The dialog usually
  // floats over the play area's library pile, so drops landing on
  // the dialog need to resolve to the library zone too (otherwise
  // the user can drag cards out but not back in). Populated by the
  // dialog via a callback ref.
  const librarySearchDialogRef = useRef<HTMLDivElement | null>(null);
  // The zone-reveal dialog (used for "View top cards..." today, plus
  // graveyard/exile reveal flows later) needs a ref so the parent's
  // drop-detection can hit-test drops that land on the dialog and
  // resolve them to the source zone.
  const zoneRevealDialogRef = useRef<HTMLDivElement | null>(null);
  // Separate ref for the graveyard / exile view dialog. Same purpose
  // as `zoneRevealDialogRef` — drop-detection needs to hit-test the
  // modal so drops don't fall through to the battlefield behind it.
  // Kept distinct so a same-zone drop resolves to the pile that
  // opened the view (graveyard vs. exile) via `pileView.zone` in
  // detectDropTarget, rather than always assuming "library" like the
  // shared reveal-dialog ref does.
  const pileViewDialogRef = useRef<HTMLDivElement | null>(null);
  // Sideboard view dialog ref — same rationale as pileViewDialogRef
  // (drop-detection needs to hit-test the modal so drops resolve to
  // SIDEBOARD instead of falling through to the battlefield).
  const sideboardDialogRef = useRef<HTMLDivElement | null>(null);

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
    onDrawCards?.(n);
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
      hand: handCards ?? NO_CARDS,
      battlefield: battlefieldCards ?? NO_CARDS,
      stack: stackCards ?? NO_CARDS,
    }),
    [handCards, battlefieldCards, stackCards],
  );
  const { selection, setSelection, clearAllSelection } = useSeatSelection(playerId, selectableCards);
  // The seat drag in progress from this seat (see the seat DnD block below).
  const seatId = playerId ?? Number(player.user_id);
  const activeSeatDrag = useActiveSeatDrag();
  const seatDrag = activeSeatDrag?.seatPlayerId === seatId ? activeSeatDrag : null;
  // "View library" dialog (full-deck reveal). Opened via the library
  // context menu; fires Command_DumpZone(numberCards=-1) on open so
  // the dialog reads the server-authoritative revealed cards.
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  // The seat's card menus: battlefield, pile view (graveyard / exile) and
  // stack. The open menu lives in the game dialog state, so it is one of the
  // game's mutually exclusive context menus; this seat renders it when it
  // opened it, and CardMenuPopup closes it on an outside click or Escape.
  const menuOwnerId = playerId ?? -1;
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
  const battlefieldDisplayList = battlefieldCards ?? [];

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
  seatShortcuts['game.removeLocalArrows'] = () => onClearOwnArrows?.();

  // Cockatrice-parity Toggle Skip Untapping (Alt+U). Acts on the
  // local marquee `selection` (same state the right-click menu reads
  // via `targetIds`). Uses the first selected card as the "clicked card"
  // to drive the target value, matching the menu's behavior for a
  // mixed selection (all cards land in the same doesntUntap state).
  seatShortcuts['game.doesntUntap'] = () => {
    if (!isSelf || !onSetCardDoesntUntap || !selection || selection.zone !== 'battlefield') {
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
      onSetCardDoesntUntap(id, target);
    }
  };

  // Put top cards on stack until… (Ctrl+Shift+Y). Opens the dialog.
  seatShortcuts['game.moveTopUntil'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    setMoveTopUntilModalOpen(true);
  };

  // Deck-flip toggles (Ctrl+Alt+N / Ctrl+Alt+Shift+N). Cockatrice
  // defaults collide with Chromium's new-window / new-incognito, so
  // we rebind. Toggles the corresponding zone property.
  seatShortcuts['game.alwaysRevealTopCard'] = () => {
    if (!isSelf || !onSetAlwaysRevealTopCard) {
      return;
    }
    onSetAlwaysRevealTopCard(!alwaysRevealTopCard);
  };
  seatShortcuts['game.alwaysLookAtTopCard'] = () => {
    if (!isSelf || !onSetAlwaysLookAtTopCard) {
      return;
    }
    onSetAlwaysLookAtTopCard(!alwaysLookAtTopCard);
  };

  // View top/bottom cards of library (Ctrl+Alt+W / Ctrl+Alt+Shift+W).
  // Rebound from Ctrl+W / Ctrl+Shift+W (browser close-tab / close-window).
  seatShortcuts['game.viewTopCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    setViewNCardsModal({ isReversed: false, deckSize: deckCount });
  };
  seatShortcuts['game.viewBottomCards'] = () => {
    if (!isSelf || deckCount <= 0) {
      return;
    }
    setViewNCardsModal({ isReversed: true, deckSize: deckCount });
  };

  // Create token (Ctrl+K, rebound from Cockatrice's Ctrl+T).
  seatShortcuts['game.createToken'] = () => {
    if (!isSelf || !onCreateToken) {
      return;
    }
    setCreateTokenModalOpen(true);
  };

  // Create another token (Ctrl+G) — re-fires the last submitted token.
  seatShortcuts['game.createAnotherToken'] = () => {
    if (!isSelf || !onCreateToken || !lastToken) {
      return;
    }
    onCreateToken(lastToken);
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
    if (!isSelf || !onSetPT || !selection || selection.zone !== 'battlefield') {
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
      onSetPT(entries);
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
    if (!isSelf || !onModifyCounter || !manaCounters?.O) {
      return;
    }
    onModifyCounter(manaCounters.O.id, 1);
  };
  seatShortcuts['game.removeStormCounter'] = () => {
    if (!isSelf || !onModifyCounter || !manaCounters?.O) {
      return;
    }
    onModifyCounter(manaCounters.O.id, -1);
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
    if (!isSelf || !onPeekCards || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const ids = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id) && bc.faceDown)
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return;
    }
    onPeekCards(ids);
  };

  // Turn Card Over (Alt+F). Same shape as doesntUntap above: read the
  // local marquee selection, use the first card's current faceDown to
  // drive the target, then fire onFlipCard per card. Matches the
  // right-click "Flip card" menu item at line ~9011.
  seatShortcuts['game.flipCard'] = () => {
    if (!isSelf || !onFlipCard || !selection || selection.zone !== 'battlefield') {
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
      onFlipCard(id, target);
    }
  };

  // Unattach (Ctrl+Alt+U). Fires per-card unattach on the selection;
  // matches the "Unattach" menu item at line ~9295. Server no-ops on
  // non-attached cards so we don't pre-filter.
  seatShortcuts['game.unattachCard'] = () => {
    if (!isSelf || !onUnattachCard || !selection || selection.zone !== 'battlefield') {
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
      onUnattachCard(id);
    }
  };

  // Move selection → Graveyard (Ctrl+Del). Single batched
  // Command_MoveCard with cards_to_move for every selected card,
  // matching the "Send to Graveyard" menu path via dispatchMove.
  seatShortcuts['game.moveSelectedToGrave'] = () => {
    if (!isSelf || !onMoveCards || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    onMoveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.GRAVE, reversed: false });
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
    if (!isSelf || !onSetPT || !selection || selection.zone !== 'battlefield') {
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
      onSetPT(entries);
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
  // (no-op when empty). Add / Remove drive `onBulkSetCardCounters`
  // with per-card cur ± 1 (clamped to [0, MAX_COUNTER_VALUE]); Set
  // opens the same modal the card-menu Set item uses (line ~9630),
  // anchored on the first selected card for name / counterLetter /
  // currentValue prefill.
  const addCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !onBulkSetCardCounters || !selection || selection.zone !== 'battlefield') {
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
      onBulkSetCardCounters(entries);
    }
  };

  const removeCardCounterOnSelection = (counterId: number) => {
    if (!isSelf || !onBulkSetCardCounters || !selection || selection.zone !== 'battlefield') {
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
      onBulkSetCardCounters(entries);
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
    if (!isSelf || !onBulkSetCardCounters) {
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
      onBulkSetCardCounters(entries);
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
    if (!isSelf || !onMoveCards || !selection || selection.zone !== 'battlefield') {
      return;
    }
    const targetIds = battlefieldDisplayList
      .filter((bc) => selection.ids.has(bc.id))
      .map((bc) => Number(bc.id))
      .filter((n) => Number.isFinite(n));
    if (targetIds.length === 0) {
      return;
    }
    onMoveCards(ZoneName.TABLE, targetIds, { zone: ZoneName.DECK, reversed: true });
  };

  // Clone Card (Ctrl+J). Fires one Command_CreateToken per selected
  // card via onCloneCard, preserving each card's own name / provider /
  // color / pt / annotation / row. Matches the "Clone" menu item at
  // line ~9085 exactly (including the optimistic-mock skip).
  seatShortcuts['game.cloneCard'] = () => {
    if (!isSelf || !onCloneCard || !selection || selection.zone !== 'battlefield') {
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
      onCloneCard({
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

  /** Ids of the cards a drag from `zone` is carrying, for dialogs that hide
   *  them while the ghost has them. */
  const draggingIdsFrom = (zone: DragSourceZone): Set<string> | undefined =>
    seatDrag?.zone === zone ? new Set(seatDrag.cards.map((c) => c.id)) : undefined;

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
          onAttachCard?.(sourceCardId, { playerId, cardId: clickedCardIdNum });
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
    if (winner.ownerId === player.user_id) {
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

  // Cross-player "receive" (gifts) and cross-board marquee forwarding.
  // receiveBattlefieldCards is now a no-op — Redux picks up the gifted
  // card from Servatrice's Event_MoveCard broadcast, so there's no
  // local state to seed; the handle is kept so the type contract with
  // Battlefield.tsx stays stable.
  useImperativeHandle(ref, () => ({
    receiveBattlefieldCards: () => {},
    startMarquee: (x: number, y: number) => {
      // Same as the local pointerdown path, but coords come from an
      // opponent's PlayerBox forwarding the interaction to us.
      setSelection(null);
      setMarquee({
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        startZone: zoneAtPoint(x, y),
      });
    },
  }));

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
    onSubmit: (value) => onSetPlayerCounter?.(counterId, Math.max(0, value)),
  }));
  // "Put top cards on stack until…" dialog + iterative loop. `Modal`
  // holds dialog-open state; `moveTopUntil` is the active loop config
  // (null = idle). See the useEffect further down that watches
  // stackCards for the reveal-and-decide step.
  const [moveTopUntilModalOpen, setMoveTopUntilModalOpen] = useState(false);
  const [moveTopUntil, setMoveTopUntil] = useState<
    { filter: CardFilter; remainingHits: number; autoPlay: boolean } | null
  >(null);
  // Set annotation / Set P/T prompts. The target ids are snapshotted when
  // the prompt opens, so the answer applies to every card that was selected
  // then, even if the selection changes meanwhile (Cockatrice's
  // cardMenuAction pattern); a single right-click carries just that card.
  // Each P/T target uses ITS OWN current P/T as the applyPTSet base, read at
  // submit time (so `+1/+1` bumps a 2/2 to 3/3 and a 4/5 to 5/6 in one
  // atomic onSetPT batch, like desktop's actSetPT loop).
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
          onSetAnnotation?.(id, value);
        }
      },
    }));
  const openPTPrompt = ({ targetIds, cardName, current }: PromptTargets) =>
    openPrompt(powerToughnessPrompt({
      cardName,
      current,
      onSubmit: (value) => {
        if (!onSetPT) {
          return;
        }
        const { battlefieldDisplayList: board, cardMetaByName: meta } = ptBaseRef.current;
        const entries = targetIds.map((id) => {
          const bc = board.find((x) => Number(x.id) === id);
          const base = bc?.pt || (bc ? meta.get(bc.name)?.pt ?? '' : '');
          return { cardId: id, pt: applyPTSet(base, value) };
        });
        if (entries.length > 0) {
          onSetPT(entries);
        }
      },
    }));
  // "Move X cards from top of library..." modal. Snapshot the deck size
  // at open time so the input's max/clamp stay stable even if a draw
  // shrinks the deck mid-dialog.
  const [moveXModal, setMoveXModal] = useState<
    { cardId: number; cardName: string; deckSize: number } | null
  >(null);
  // "Draw cards..." modal — Cockatrice's `actRequestDrawCardsDialog`.
  // Snapshots deck size at open time; the DrawCardsModal clamps input
  // to that snapshot so a concurrent draw doesn't move the goalposts.
  const [drawCardsModal, setDrawCardsModal] = useState<
    { deckSize: number } | null
  >(null);
  // "View top / bottom cards of library..." modal + dialog. The modal
  // asks for N, then the dialog opens with `revealedDeckCards` after
  // the server responds to Command_DumpZone. `isReversed` distinguishes
  // top (false) from bottom (true).
  const [viewNCardsModal, setViewNCardsModal] = useState<
    { isReversed: boolean; deckSize: number } | null
  >(null);
  // The ViewTopCardsDialog carries the direction so its header can
  // read "Top N" or "Bottom N" correctly. `null` = closed.
  const [topCardsView, setTopCardsView] = useState<{ isReversed: boolean } | null>(
    null,
  );
  // "View graveyard" / "View exile" — persistent dialog listing every
  // card in the public pile. Both are PublicZones so Redux already
  // carries the full byId/order — no wire needed to open, unlike the
  // library flows above which have to Command_DumpZone first. Mirrors
  // Cockatrice's actViewGraveyard / actViewRfg (player_actions.cpp:222-230)
  // which just emit requestZoneViewToggle(zone, -1). `null` = closed.
  const [pileView, setPileView] = useState<
    { zone: 'graveyard' | 'exile' | 'hand' } | null
  >(null);

  // External "View library" trigger (F3 shortcut, sidebar, etc.).
  // Battlefield right-click "View library" does two things: fires
  // Command_DumpZone(numberCards=-1) then opens LibrarySearchDialog.
  // The context flag lets the same flow fire from anywhere. We flip
  // the trigger off immediately (closeViewLibrary) so a subsequent
  // shortcut press after manually closing the dialog re-fires.
  // Owner-only — closeViewLibrary still runs for opponents so a stray
  // trigger doesn't get stuck on.
  useEffect(() => {
    if (!viewLibraryOpen) {
      return;
    }
    if (isSelf) {
      onDumpTopCards?.(-1, false);
      setLibrarySearchOpen(true);
    }
    closeViewLibrary();
  }, [viewLibraryOpen, isSelf, onDumpTopCards, closeViewLibrary]);

  // External "View graveyard" trigger (F4 shortcut, sidebar, etc.).
  // Mirrors the battlefield right-click "View graveyard" menu item:
  // sets pileView so the LibrarySearchDialog opens against the
  // graveyard's Redux-carried card list (no wire needed — grave is
  // a PublicZone).
  useEffect(() => {
    if (!viewGraveyardOpen) {
      return;
    }
    if (isSelf) {
      setPileView({ zone: 'graveyard' });
    }
    closeViewGraveyard();
  }, [viewGraveyardOpen, isSelf, closeViewGraveyard]);

  // "Reveal top cards to..." prompt. Reuses ViewNCardsModal — the
  // input math (deck-size-clamped positive integer) is identical to
  // the "View top cards" flow. `targetPlayerId === -1` means "All
  // players" and translates to no player_id on the wire (proto2 field
  // presence trap). `deckSize` is snapshotted at open time so a
  // concurrent draw doesn't move the max value while the user types.
  const [revealTopCardsPrompt, setRevealTopCardsPrompt] = useState<
    { targetPlayerId: number; targetName: string; deckSize: number } | null
  >(null);
  // Generic numeric-prompt for the Top-of-library / Bottom-of-library
  // multi-card submenu items (Move top N to grave/exile ± face-down,
  // Draw bottom N, Move bottom N to grave/exile ± face-down, Shuffle
  // top/bottom N). All reuse ViewNCardsModal — same input math (positive
  // integer clamped to deck size) — with a per-action title, submit
  // label, and inline `onSubmit` that fires the wire. Snapshotting the
  // deck size at open time matches other prompts here.
  const [countPrompt, setCountPrompt] = useState<
    {
      title: string;
      submitLabel: string;
      deckSize: number;
      onSubmit: (n: number) => void;
        } | null
        >(null);
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
      onBulkSetCardCounters?.(targetIds.map((id) => ({ cardId: id, counterId, value: Math.max(0, value) })));
    },
  }));
  // "Create token..." modal (Tailwind — replaces the old MUI
  // CreateTokenDialog wired via useGameDialogs; see feedback memory
  // "Replace MUI, don't override it"). Local to this PlayerBox so the
  // wire fires against the local player's battlefield only, matching
  // where the right-click menu lives.
  const [createTokenModalOpen, setCreateTokenModalOpen] = useState(false);
  // Last successfully-submitted token — powers "Create another token"
  // (Cockatrice's actCreateAnotherToken, player_actions.cpp:894-916).
  // Persisted across the modal's open/close cycle so a subsequent
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
       *  `onCreateArrow` so the wire's `startZone` matches where the
       *  source card actually lives — arrows drawn from a grave card
       *  render off the grave pile at both ends' clients. */
      sourceZone: string;
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
          onCreateArrow?.(source.sourceCardId, source.sourceZone, {
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
          onCreateArrow?.(source.sourceCardId, source.sourceZone, {
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
  }, [drawArrowPending, playerId, onCreateArrow]);
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
  const displayedDeckCount = zoneCounts?.deck ?? 0;
  const displayedGraveyardCount = zoneCounts?.grave ?? 0;
  const displayedExileCount = zoneCounts?.rfg ?? 0;

  // All zone display lists come straight from Redux — there is no local
  // mock any more. Empty arrays are truthful (an empty zone renders
  // empty, not "the last thing we knew about"). Owner-side pile drags
  // grab the last card in the display list; opponent-side pile drags
  // show a card-back count only (Redux gives us `zone.cardCount`
  // without the actual card identities for hidden zones).
  const graveDisplayList = graveCards ?? [];
  const exileDisplayList = exileCards ?? [];
  const handDisplayList = handCards ?? [];
  const handCount = zoneCounts?.hand ?? handDisplayList.length;

  // DeckCards enriched with Scryfall/Dexie metadata (`cardMetaByName`),
  // used only by the "View library" search dialog. The .cod parser
  // nulls type_line/cmc/colors/mana_cost/power/toughness because .cod
  // XML doesn't ship them; without this backfill, the dialog's Group
  // by Type / Sort by CMC / etc. would degrade to a single "Other"
  // bucket. Prefer any non-null field already on the DeckCard so a
  // future .cod format that DOES carry metadata isn't overwritten.
  const enrichedDeckCards = useMemo<DeckCard[]>(
    () =>
      cards.map((c) => {
        const meta = cardMetaByName.get(c.name);
        if (!meta) {
          return c;
        }
        return {
          ...c,
          type_line: c.type_line ?? meta.typeLine ?? null,
          mana_cost: c.mana_cost ?? meta.manaCost ?? null,
          cmc: c.cmc ?? meta.cmc ?? null,
          colors: c.colors.length > 0 ? c.colors : meta.colors ?? [],
          power: c.power ?? meta.power ?? null,
          toughness: c.toughness ?? meta.toughness ?? null,
        };
      }),
    [cards, cardMetaByName],
  );
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
  const stackDisplayList = useMemo(() => stackCards ?? [], [stackCards]);

  // Move-top-until iterative loop. When the dialog confirms, we fire
  // the first Command_MoveCard (DECK top → STACK) and enter active
  // state. Each server-broadcast Event_MoveCard updates `stackCards`,
  // this effect detects the new stack entry, checks its name against
  // the filter, decrements the hit counter on match (optionally
  // auto-plays), and fires the next move — or stops when the counter
  // hits zero or the library empties. Mirrors Cockatrice's
  // PlayerActions::moveOneCardUntil (player_actions.cpp:504-528).
  //
  // `seenStackIdsRef` is a snapshot of stack ids the loop has already
  // processed (initialized when the loop starts). Cards added by
  // *other* moves (e.g. someone else casts a spell) are recorded but
  // don't affect the match logic — only same-owner DECK-sourced moves
  // count. The Event_MoveCard listener already gates the reducer so
  // the same card doesn't land in stackCards twice.
  const seenStackIdsRef = useRef<Set<number | string>>(new Set());
  useEffect(() => {
    if (!isSelf || !moveTopUntil) {
      return;
    }
    // Detect newly-added stack ids.
    const newIds: (number | string)[] = [];
    for (const c of stackDisplayList) {
      if (!seenStackIdsRef.current.has(c.id)) {
        newIds.push(c.id);
      }
    }
    // Update the seen set regardless of whether we act on the new
    // cards — a mid-loop stack entry from an unrelated move should
    // still be recorded so the NEXT reveal we fire is the only "new"
    // card when it arrives.
    for (const id of newIds) {
      seenStackIdsRef.current.add(id);
    }
    if (newIds.length === 0) {
      return;
    }
    // MVP: only care about the last new card (Cockatrice fires one
    // move at a time, so realistically newIds.length === 1). If
    // multiple appeared, take the top-most (last in stack order).
    const revealedId = newIds[newIds.length - 1];
    const revealed = stackDisplayList.find((c) => c.id === revealedId);
    if (!revealed) {
      return;
    }
    const revealedMeta = cardMetaByName.get(revealed.name);
    const filterableCard: FilterableCard = {
      name: revealed.name ?? '',
      typeLine: revealedMeta?.typeLine,
      cmc: revealedMeta?.cmc,
      colors: revealedMeta?.colors,
      power: revealedMeta?.power,
      toughness: revealedMeta?.toughness,
    };
    const isMatch = revealed.name != null && matchCard(moveTopUntil.filter, filterableCard);
    let remaining = moveTopUntil.remainingHits;
    if (isMatch) {
      remaining -= 1;
      if (moveTopUntil.autoPlay) {
        // Play the matched card: move from STACK to TABLE.
        const revealedIdNum = Number(revealed.id);
        if (onMoveCards && Number.isFinite(revealedIdNum)) {
          onMoveCards(ZoneName.STACK, [revealedIdNum], { zone: ZoneName.TABLE, index: 'end' });
        }
      }
    }
    // Stop if we've hit the target count OR the library ran out.
    if (remaining <= 0 || deckCount <= 0) {
      setMoveTopUntil(null);
      return;
    }
    // Fire the next reveal. If we found a match this iteration but
    // still have remaining hits, keep going.
    if (!onMoveCards) {
      setMoveTopUntil(null);
      return;
    }
    onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
    if (isMatch) {
      setMoveTopUntil({ ...moveTopUntil, remainingHits: remaining });
    }
  }, [stackDisplayList, moveTopUntil, isSelf, deckCount, onMoveCards, cardMetaByName]);

  // Kicks off the loop: snapshot current stack ids so the *next*
  // stack addition is treated as the first reveal, then fire the
  // first move. Called by the dialog's onConfirm.
  const startMoveTopUntil = (args: {
    filter: string;
    hits: number;
    autoPlay: boolean;
  }): void => {
    if (!isSelf || !onMoveCards || deckCount <= 0) {
      return;
    }
    const parsed = parseCardFilter(args.filter);
    if (isFilterEmpty(parsed)) {
      // Refuse to run an empty filter — it would match every reveal
      // and dump the whole library into the stack.
      return;
    }
    seenStackIdsRef.current = new Set(stackDisplayList.map((c) => c.id));
    setMoveTopUntil({
      filter: parsed,
      remainingHits: args.hits,
      autoPlay: args.autoPlay,
    });
    onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
  };
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
    if (!onMoveCards || list.length === 0) {
      return;
    }
    const cardIds = list.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    // `source` param is intentionally unused inside the wire (startZone
    // carries the wire name); it's a documentation hint for the caller.
    void source;
    onMoveCards(startZone, cardIds, { zone: targetZone, index });
  };
  // "Reveal random card to..." submenu — used by grave. Same shape as
  // reveal-library: All players (playerId=-1) + separator + one row
  // per opponent. Disabled when the source pile is empty (Servatrice
  // returns RespContextError on empty-zone random reveals,
  // server_abstract_player.cpp:1504).
  const buildRevealRandomSubmenu = (
    zoneName: string,
    zoneSize: number,
  ): ContextMenuItem[] =>
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () => onRevealRandomFromZone?.(zoneName, -1),
          disabled: zoneSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => onRevealRandomFromZone?.(zoneName, t.playerId),
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
      onClick: () => setPileView({ zone: 'graveyard' }),
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
      onClick: () => setPileView({ zone: 'graveyard' }),
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
      onClick: () => setPileView({ zone: 'exile' }),
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
      onClick: () => setPileView({ zone: 'exile' }),
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
    if (!onMoveCards || deckCount <= 0) {
      return;
    }
    onMoveCards(ZoneName.DECK, [faceDown ? { id: 0, faceDown: true } : 0], { zone: targetZone, index });
  };
  // Single-card "Bottom of library..." → target move click. Wire uses
  // cardId=deckCount-1 (cmdSetBottomCard, player_actions.cpp:384).
  const buildMoveBottomCardTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ): (() => void) => () => {
    if (!onMoveCards || deckCount <= 0) {
      return;
    }
    const id = deckCount - 1;
    onMoveCards(ZoneName.DECK, [faceDown ? { id, faceDown: true } : id], { zone: targetZone, index });
  };
  // Multi-card "Move top N to <target>" prompt. Iterates i in
  // [N-1..0] to match moveTopCardsTo iteration order (player_actions.cpp:475).
  const promptMoveTopNTo = (
    title: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ): (() => void) => () => {
    const size = deckCount;
    if (!onMoveCards || size <= 0) {
      return;
    }
    setCountPrompt({
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
        onMoveCards(ZoneName.DECK, cards, { zone: targetZone });
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
    if (!onMoveCards || size <= 0) {
      return;
    }
    setCountPrompt({
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
        onMoveCards(ZoneName.DECK, cards, { zone: targetZone });
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
        { label: 'All players', onClick: () => onRevealLibrary?.(-1) },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => onRevealLibrary?.(t.playerId),
        })),
      ]
      : [{ label: '(no players)' }];
  const lendLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? revealTargets.map((t) => ({
        label: t.name,
        onClick: () => onLendLibrary?.(t.playerId),
      }))
      : [{ label: '(no players)' }];
  const revealTopCardsItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () =>
            setRevealTopCardsPrompt({
              targetPlayerId: -1,
              targetName: 'all players',
              deckSize: deckCount,
            }),
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () =>
            setRevealTopCardsPrompt({
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
      onClick: () => setDrawCardsModal({ deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawMultipleCards'],
    },
    {
      label: 'Undo last draw',
      onClick: () => onUndoDraw?.(),
      // Cockatrice always shows this enabled; server rejects when
      // nothing to undo.
      shortcut: shortcutHints['game.undoDraw'],
    },
    { divider: true },
    {
      label: 'Shuffle',
      onClick: () => onShuffle?.(),
      disabled: deckCount <= 1,
      shortcut: shortcutHints['game.shuffleLibrary'],
    },
    { divider: true },
    {
      label: 'View library',
      onClick: () => {
        onDumpTopCards?.(-1, false);
        setLibrarySearchOpen(true);
      },
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewLibrary'],
    },
    {
      label: 'View top cards of library...',
      onClick: () =>
        setViewNCardsModal({ isReversed: false, deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewTopCards'],
    },
    {
      label: 'View bottom cards of library...',
      onClick: () =>
        setViewNCardsModal({ isReversed: true, deckSize: deckCount }),
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
      onClick: () => onSetAlwaysRevealTopCard?.(!alwaysRevealTopCard),
      shortcut: shortcutHints['game.alwaysRevealTopCard'],
    },
    {
      label: 'Always look at top card',
      checked: alwaysLookAtTopCard ?? false,
      onClick: () => onSetAlwaysLookAtTopCard?.(!alwaysLookAtTopCard),
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
          onClick: () => setMoveTopUntilModalOpen(true),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopUntil'],
        },
        { divider: true },
        {
          label: 'Shuffle top cards...',
          onClick: () => {
            const size = deckCount;
            if (!onShuffleRange || size <= 0) {
              return;
            }
            setCountPrompt({
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
                onShuffleRange(0, count - 1);
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
            if (!onShuffleRange || size <= 0) {
              return;
            }
            setCountPrompt({
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
                onShuffleRange(-count, -1);
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
  // but its cardCount is public). Falling back to `handCards.length`
  // as second choice would silently return 0 for opponents — their
  // handCards array is always empty because they don't ship the card
  // identities to us — so nullish-coalescing to it would leave the
  // badge stuck at 0.
  const handSize = zoneCounts?.hand ?? handCards?.length ?? 0;
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
          onClick: () => onRevealZone?.(ZoneName.HAND, -1),
          disabled: handSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => onRevealZone?.(ZoneName.HAND, t.playerId),
          disabled: handSize <= 0,
        })),
      ]
      : [{ label: '(no players)' }];
  const revealRandomHandSubmenu: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () => onRevealRandomFromZone?.(ZoneName.HAND, -1),
          disabled: handSize <= 0,
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () =>
            onRevealRandomFromZone?.(ZoneName.HAND, t.playerId),
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
    if (!onMoveCards || !handCards || handCards.length === 0) {
      return;
    }
    const cardIds = handCards.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    onMoveCards(ZoneName.HAND, cardIds, { zone: targetZone, index });
  };
  const handMenuItems: ContextMenuItem[] = [
    {
      // View hand — reuses the generic zone-view dialog (same
      // widget as View library / graveyard / exile). Only offered
      // for the local player; opponents' hands are hidden and the
      // dialog would have nothing to show.
      label: 'View hand',
      onClick: () => setPileView({ zone: 'hand' }),
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
      onClick: () => onMulligan?.(handSize),
      disabled: handSize <= 0,
      shortcut: shortcutHints['game.mulliganSameSize'],
    },
    {
      label: 'Take mulligan (Hand size - 1)',
      onClick: () => onMulligan?.(Math.max(1, handSize - 1)),
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
  // `.onSet` for life, and `onModifyCounter(id, delta)` for the mana
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
    const canModify = counter != null && onModifyCounter != null;
    const canSet = counter != null && onSetPlayerCounter != null;
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
            onModifyCounter(counter.id, d);
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
          // We reuse LibrarySearchDialog against the local player's
          // sideboard zone (mounted below in the modal render block).
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
      // onModifyCounter, and life's Set via the Ctrl+L modal.
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
        if (!onBulkSetCardCounters) {
          return;
        }
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
          onBulkSetCardCounters(entries);
        }
      },
      disabled:
        !onBulkSetCardCounters || battlefieldDisplayList.length === 0,
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
      onClick: () => onUntapAll?.(),
      disabled: !onUntapAll,
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
      onClick: () => onFlipCoin?.(),
      disabled: !onFlipCoin,
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
      onClick: () => setCreateTokenModalOpen(true),
      disabled: !onCreateToken,
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
        if (onCreateToken && lastToken) {
          onCreateToken(lastToken);
        }
      },
      disabled: !onCreateToken || !lastToken,
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
  // The graveyard / exile / hand view dialog drags from the pile it shows.
  const pileViewDragSource = useSeatDragSource(`seat-${seatId}-pile-view`, {
    seatPlayerId: seatId,
    canDrag: canMoveSeatCards,
    zone: pileView?.zone ?? 'graveyard',
    disabled: !pileView,
  });
  const battlefieldDragSource = useSeatDragSource(`seat-${seatId}-battlefield`, {
    seatPlayerId: seatId,
    canDrag: canMoveSeatCards,
    zone: 'battlefield',
  });
  // Hidden zones: the library pile drags its top card (position 0); the
  // search, reveal and sideboard dialogs drag by the server position their
  // snapshot carries as the card id.
  const libraryDragSource = useSeatDragSource(`seat-${seatId}-library`, {
    seatPlayerId: seatId,
    zone: 'library',
    canDrag: canMoveSeatCards,
  });
  const librarySearchDragSource = useSeatDragSource(`seat-${seatId}-library-search`, {
    seatPlayerId: seatId,
    canDrag: canMoveSeatCards,
    zone: 'library',
  });
  const revealDragSource = useSeatDragSource(`seat-${seatId}-reveal`, {
    seatPlayerId: seatId,
    zone: 'library',
    canDrag: canMoveSeatCards,
  });
  const sideboardDragSource = useSeatDragSource(`seat-${seatId}-sideboard-view`, {
    seatPlayerId: seatId,
    canDrag: canMoveSeatCards,
    zone: 'sideboard',
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
  // The seat's dialogs float over the board and take drops before it.
  const librarySearchDropRef = useSeatDropZone(`seat-${seatId}-library-search`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.librarySearchDialog,
    resolve: () => ({ zone: 'library' }),
  });
  // The graveyard / exile view resolves to the pile it shows, so a drop back
  // onto it is a same-zone no-op. The hand view appends: it sorts and groups,
  // so a positional insert wouldn't match what the user sees. That append is
  // meaningless for a hand card dropped back on its own viewer, so that drop
  // resolves to no target and the card snaps back.
  const pileViewDropRef = useSeatDropZone(`seat-${seatId}-pile-view`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.pileViewDialog,
    resolve: (_drop, source) => {
      if (!pileView) {
        return null;
      }
      if (pileView.zone === 'hand') {
        return source.zone === 'hand' ? null : { zone: 'hand', index: handDisplayList.length };
      }
      return { zone: pileView.zone };
    },
  });
  // The sideboard is hidden: drops append (x = -1).
  const sideboardDropRef = useSeatDropZone(`seat-${seatId}-sideboard-view`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.sideboardDialog,
    resolve: () => (viewSideboardOpen ? { zone: 'sideboard' } : null),
  });
  // The top/bottom-N reveal: the drop lands between two revealed cards (past
  // a card's centre means after it), at the deck position that slot shows.
  // Top view: slot k is position k; bottom-N view: deckCount - N + k.
  const revealDropRef = useSeatDropZone(`seat-${seatId}-reveal`, {
    seatPlayerId: seatId,
    priority: SEAT_DROP_PRIORITY.revealDialog,
    resolve: ({ pointer }) => {
      const cardEls = zoneRevealDialogRef.current?.querySelectorAll<HTMLElement>('[data-card][data-card-id]');
      let slot = 0;
      let best = Infinity;
      cardEls?.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = (pointer.x - cx) ** 2 + (pointer.y - cy) ** 2;
        if (dist < best) {
          best = dist;
          slot = pointer.x > cx ? i + 1 : i;
        }
      });
      const revealCount = revealedDeckCards?.length ?? 0;
      const base = topCardsView?.isReversed ? deckCount - revealCount : 0;
      return { zone: 'library', position: Math.max(0, Math.min(deckCount, base + slot)) };
    },
  });
  const battlefieldScrollRef = useForkRef(scrollContainerRef, battlefieldDropRef);
  const stackZoneRef = useForkRef(stackRef, stackDropRef);
  const handZoneRef = useForkRef(handRef, handDropRef);
  const libraryZoneRef = useForkRef(libraryRef, libraryDropRef);
  const graveyardZoneRef = useForkRef(graveyardRef, graveyardDropRef);
  const exileZoneRef = useForkRef(exileRef, exileDropRef);
  const librarySearchDialogZoneRef = useForkRef(librarySearchDialogRef, librarySearchDropRef);
  const pileViewDialogZoneRef = useForkRef(pileViewDialogRef, pileViewDropRef);
  const sideboardDialogZoneRef = useForkRef(sideboardDialogRef, sideboardDropRef);
  const revealDialogZoneRef = useForkRef(zoneRevealDialogRef, revealDropRef);

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDownBox}
      className={[
        'h-full min-h-0 rounded-lg border overflow-hidden bg-bg-surface/60 backdrop-blur-sm transition-shadow select-none',
        isActive ? 'border-accent' : 'border-border-subtle',
      ].join(' ')}
      style={{
        display: 'grid',
        // Info column width in em so it scales with the box's font-size.
        // Info col hosts life + a 3×2 mana pip grid + the vertical zone
        // stack (library / graveyard / exile). Zones are card-sized
        // (CARD_HEIGHT wide because they're rotated) and the pip row
        // (3 pips at ~2em each + gaps) is narrower, so we just need
        // CARD_HEIGHT + a small padding allowance.
        //
        // Middle col holds command zone + stack — sized so that after
        // p-2 (0.5rem each side = 1rem total) the inner width equals
        // exactly one card width. Hand row height tracks CARD_HEIGHT
        // + a small non-scaling breathing gap so hand cards don't
        // overflow at bigger scales.
        gridTemplateColumns: `calc(${CARD_HEIGHT} + 1.5em) calc((${CARD_WIDTH} + 1rem) * 1.2) 1fr`,
        // Hand row reserves 60% of a card height + a hair of breathing
        // room. When idle, 60% of each hand card is visible (bottom
        // 40% clipped); on hover, the hand div flips its overflow open
        // and lets the remaining 40% float into the play-area's cell
        // without reflowing anything behind it. Same "hover overlay"
        // pattern as the phase track.
        gridTemplateRows: handOnTop
          ? `calc(${CARD_HEIGHT} * 0.6 + 0.5em) 1fr`
          : `1fr calc(${CARD_HEIGHT} * 0.6 + 0.5em)`,
        // Stronger accent glow than shadow-glow when it's this player's turn.
        boxShadow: isActive
          ? '0 0 28px 0 rgb(var(--accent-primary) / 0.5), 0 0 10px 0 rgb(var(--accent-primary) / 0.35)'
          : undefined,
      }}
    >
      {/* Info column — spans both rows. Top: full-width header + life total.
          Bottom: mana-pool sub-column on the left + card zones on the right. */}
      <div
        className="row-span-full border-r border-border-subtle bg-bg-surface/70 flex flex-col p-[0.75em] gap-[0.5em] min-h-0"
        style={{ gridColumn: 1 }}
      >
        {/* Combined name + life-total pill. Avatar (or purple gradient
             fallback) fills the whole block; a 50% black wash keeps
             the name / number readable. The player name sits pinned
             to the top-left, the life total is centered — merging the
             two into a single visual block instead of a name row plus
             a separate life pill.
             Owner interactions on the whole block:
               • left click  → +1 life (delta)
               • right click → -1 life (delta) — browser context menu
                 is suppressed via preventDefault
               • Ctrl / Cmd + L → opens the set-life modal (registered
                 in a useEffect below on window keydown; only fires for
                 the local player's box)
             Non-owner boxes render read-only (no cursor change, no
             click handlers). */}
        <div
          role={isSelf ? 'button' : undefined}
          tabIndex={isSelf ? 0 : undefined}
          aria-label={isSelf ? `${name} — life total. Left click +1, right click -1, Ctrl/Cmd+L to set` : `${name} — life total`}
          // Arrow target for right-click-drag arrows aimed at a player's
          // life total. The interactions hook hit-tests by looking for
          // `[data-arrow-target-kind="player"]` under the pointer; the
          // overlay resolves player-targeted committed arrows the same
          // way. Both self and opponent pills carry these — you can
          // point arrows at yourself in Cockatrice too.
          data-arrow-target-kind="player"
          data-arrow-target-player-id={playerId}
          onClick={isSelf ? () => setLife((l) => l + 1) : undefined}
          onContextMenu={
            isSelf
              ? (e) => {
                e.preventDefault();
                setLife((l) => l - 1);
              }
              : undefined
          }
          className={[
            'relative flex flex-col rounded-md overflow-hidden',
            isSelf ? 'cursor-pointer select-none' : '',
          ].join(' ')}
          style={{
            backgroundImage: player.profile?.avatar_url
              ? `url(${player.profile.avatar_url})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!player.profile?.avatar_url && (
            <>
              <div
                className="absolute inset-0 bg-gradient-to-br from-accent-secondary to-accent pointer-events-none"
                aria-hidden
              />
              {/* Wash only over the purple fallback — keeps no-avatar
                  pills at a consistent darker tone. Avatars stay
                  unfiltered so the user's picture reads clearly. */}
              <div
                className="absolute inset-0 bg-black/50 pointer-events-none"
                aria-hidden
              />
            </>
          )}
          {/* Name row — pinned to the top. Stacked text-shadows (soft
              halo + tight outline) give the name a dark drop shadow
              that stays readable against any avatar color without
              needing a wash over the image. */}
          <div className="relative z-10 px-[0.5em] pt-[0.35em] pointer-events-none">
            <span
              className="block text-[0.875em] font-semibold text-white truncate"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,1), 0 0 1px rgba(0,0,0,1)' }}
            >
              {name}
            </span>
          </div>
          {/* Life row — centered in the remaining space. The Heart is
              an SVG so we use `filter: drop-shadow(...)` for its
              shadow (text-shadow only affects glyphs). */}
          <div className="relative z-10 flex-1 flex items-center justify-start gap-[0.75em] px-[0.5em] pb-[0.25em] pointer-events-none">
            <Heart
              size="2.5em"
              className="text-red-400"
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,1))' }}
            />
            <span
              className="text-[3em] font-modern font-bold tabular-nums text-white leading-none"
              style={{ textShadow: '0 3px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,1)' }}
            >
              {life}
            </span>
          </div>
        </div>

        {/* Below the life total: mana pool sits as the first item of
             the zone column — same `justify-evenly` distribution as
             library / graveyard / exile so it reads as one of the
             stacked column items rather than a separate block. */}
        <div className="flex-1 min-w-0 flex flex-col justify-evenly min-h-0">
          {/* Mana pool — 3 × 2 grid of pips (WUB / RGC). Grid keeps
              the block compact so the info column stays narrow. */}
          <div className="shrink-0 grid grid-cols-3 gap-1 justify-items-center">
            {MANA_COLORS.map((m, i) => {
              const counter = manaCounters?.[m.symbol];
              const canModify =
                isSelf && counter != null && onModifyCounter != null;
              const pip = (
                <ManaPip
                  symbol={m.symbol}
                  label={m.label}
                  tint={m.tint}
                  count={manaPool[m.symbol]}
                  onIncrement={
                    canModify
                      ? () => onModifyCounter(counter.id, 1)
                      : undefined
                  }
                  onDecrement={
                    canModify
                      ? () => onModifyCounter(counter.id, -1)
                      : undefined
                  }
                />
              );
              // 7 pips in a 3-col grid → the last one wraps to a new
              // row alone in column 1. Span the full row and center
              // it via flex so the odd-one-out sits under the middle
              // column instead of hugging the left edge.
              const isLastInPartialRow =
                MANA_COLORS.length % 3 !== 0 &&
                i === MANA_COLORS.length - 1;
              if (isLastInPartialRow) {
                return (
                  <div
                    key={m.symbol}
                    className="col-span-3"
                  >
                    {pip}
                  </div>
                );
              }
              return <div key={m.symbol}>{pip}</div>;
            })}
          </div>
          {isSelf ? (
            <ContextMenu
              items={[
                // Order + labels + shortcuts ported 1:1 from Cockatrice's
                // library context menu (deck_menu.cpp / TabGame shortcuts).
                // Items without onClick render as disabled placeholders
                // — this iteration is a visual match; wiring follows.
                {
                  label: 'Draw card',
                  onClick: () => draw(1),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.drawCard'],
                },
                {
                  label: 'Draw cards...',
                  onClick: () =>
                    setDrawCardsModal({ deckSize: deckCount }),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.drawMultipleCards'],
                },
                {
                  label: 'Undo last draw',
                  onClick: () => onUndoDraw?.(),
                  // No client-side gate — the server rejects when
                  // there's nothing to undo (matches Cockatrice, which
                  // also always shows the item enabled).
                  shortcut: shortcutHints['game.undoDraw'],
                },
                { divider: true },
                {
                  label: 'Shuffle',
                  onClick: () => {
                    onShuffle?.();
                  },
                  disabled: deckCount <= 1,
                  shortcut: shortcutHints['game.shuffleLibrary'],
                },
                { divider: true },
                {
                  // "View library" — fires a full-deck dump
                  // (Command_DumpZone with numberCards=-1) and opens the
                  // search dialog against Redux `revealedCards`. Mirrors
                  // Cockatrice's actViewLibrary (player_actions.cpp).
                  label: 'View library',
                  onClick: () => {
                    onDumpTopCards?.(-1, false);
                    setLibrarySearchOpen(true);
                  },
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.viewLibrary'],
                },
                {
                  label: 'View top cards of library...',
                  onClick: () =>
                    setViewNCardsModal({
                      isReversed: false,
                      deckSize: deckCount,
                    }),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.viewTopCards'],
                },
                {
                  label: 'View bottom cards of library...',
                  // Same flow as "View top cards" but with is_reversed=true
                  // on Command_DumpZone: server sends the bottom-N slice
                  // face-up, ids equal to their actual deck positions
                  // (deckSize-N .. deckSize-1). Reveal dialog labels
                  // and reorder math already branch on isReversed.
                  onClick: () =>
                    setViewNCardsModal({
                      isReversed: true,
                      deckSize: deckCount,
                    }),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.viewBottomCards'],
                },
                { divider: true },
                {
                  // "Reveal library to..." — mirrors Cockatrice's
                  // populateRevealLibraryMenuWithActivePlayers
                  // (library_menu.cpp:259-278). "All players"
                  // sits at the top (player_id=-1), separator, then
                  // one entry per other seated player. Disabled when
                  // nobody else is at the table.
                  label: 'Reveal library to...',
                  submenu:
                      revealTargets && revealTargets.length > 0
                        ? [
                          {
                            label: 'All players',
                            onClick: () => onRevealLibrary?.(-1),
                          },
                          { divider: true },
                          ...revealTargets.map((t) => ({
                            label: t.name,
                            onClick: () => onRevealLibrary?.(t.playerId),
                          })),
                        ]
                        : [{ label: '(no players)' }],
                },
                {
                  // "Lend library to..." — same targets as Reveal
                  // but without the "All players" option: Cockatrice's
                  // populateLendLibraryMenuWithActivePlayers
                  // (library_menu.cpp:280-293) intentionally omits
                  // the broadcast entry (write access can only be
                  // granted to a single player). Fires
                  // Command_RevealCards with grant_write_access=true;
                  // the target gains permission to move cards from
                  // this player's deck until the next shuffle.
                  label: 'Lend library to...',
                  submenu:
                      revealTargets && revealTargets.length > 0
                        ? revealTargets.map((t) => ({
                          label: t.name,
                          onClick: () => onLendLibrary?.(t.playerId),
                        }))
                        : [{ label: '(no players)' }],
                },
                {
                  // "Reveal top cards to..." — same target list as
                  // "Reveal library to..." (All players + separator +
                  // one per opponent, per library_menu.cpp:295-314).
                  // Each entry opens a numeric prompt for the count
                  // (library_menu.cpp:340-342) before firing the wire.
                  label: 'Reveal top cards to...',
                  submenu:
                      revealTargets && revealTargets.length > 0
                        ? [
                          {
                            label: 'All players',
                            onClick: () =>
                              setRevealTopCardsPrompt({
                                targetPlayerId: -1,
                                targetName: 'all players',
                                deckSize: deckCount,
                              }),
                          },
                          { divider: true },
                          ...revealTargets.map((t) => ({
                            label: t.name,
                            onClick: () =>
                              setRevealTopCardsPrompt({
                                targetPlayerId: t.playerId,
                                targetName: t.name,
                                deckSize: deckCount,
                              }),
                          })),
                        ]
                        : [{ label: '(no players)' }],
                },
                {
                  // "Always reveal top card" — toggles Cockatrice's
                  // per-zone always_reveal_top_card flag
                  // (library_menu.cpp:197-202,
                  // player_actions.cpp:199-205). When ON, everyone
                  // (including this player) sees the deck's top card
                  // face-up; the server automatically re-emits the
                  // reveal on every draw / shuffle / move-to-top via
                  // revealTopCardIfNeeded
                  // (server_abstract_player.cpp:558-565).
                  label: 'Always reveal top card',
                  checked: alwaysRevealTopCard ?? false,
                  onClick: () =>
                    onSetAlwaysRevealTopCard?.(!alwaysRevealTopCard),
                  shortcut: shortcutHints['game.alwaysRevealTopCard'],
                },
                {
                  // "Always look at top card" — same shape but only
                  // the owner sees the face (server-side
                  // revealTopCardIfNeeded emits Event_RevealCards
                  // privately per server_abstract_player.cpp:567-580).
                  // Independent of always-reveal — Cockatrice's menu
                  // doesn't gate either on the other.
                  label: 'Always look at top card',
                  checked: alwaysLookAtTopCard ?? false,
                  onClick: () =>
                    onSetAlwaysLookAtTopCard?.(!alwaysLookAtTopCard),
                  shortcut: shortcutHints['game.alwaysLookAtTopCard'],
                },
                { divider: true },
                {
                  // "Top of library..." — Cockatrice's LibraryMenu
                  // topLibraryMenu (library_menu.cpp:50-62). Order,
                  // labels, and separators match 1:1. Single-card
                  // items direct-fire Command_MoveCard with cardId=0
                  // (cmdSetTopCard convention, player_actions.cpp:376);
                  // multi-card items open a numeric prompt and iterate
                  // cardsToMove entries `i in [N-1..0]` (matches
                  // moveTopCardsTo iteration order at :475).
                  label: 'Top of library...',
                  disabled: deckCount <= 0,
                  submenu: [
                    {
                      label: 'Play top card',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Play top card face down',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [{ id: 0, faceDown: true }], { zone: ZoneName.TABLE, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Put top card on bottom',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.DECK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Move top card to graveyard',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.GRAVE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to graveyard...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move top cards to graveyard',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            // Cockatrice iterates i from N-1 down to
                            // 0 (moveTopCardsTo, :475). Preserving
                            // that order keeps parity with any log
                            // formatting or replay tooling that
                            // assumes the same ordering.
                            const cards: SeatMoveCard[] = [];
                            for (let i = count - 1; i >= 0; i--) {
                              cards.push(i);
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to graveyard face down...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title:
                              'Move top cards to graveyard face down',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = count - 1; i >= 0; i--) {
                              cards.push({ id: i, faceDown: true });
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top card to exile',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [0], { zone: ZoneName.EXILE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to exile...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move top cards to exile',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = count - 1; i >= 0; i--) {
                              cards.push(i);
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to exile face down...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move top cards to exile face down',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = count - 1; i >= 0; i--) {
                              cards.push({ id: i, faceDown: true });
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      // "Put top cards on stack until..." — Cockatrice
                      label: 'Put top cards on stack until…',
                      onClick: () => setMoveTopUntilModalOpen(true),
                      disabled: deckCount <= 0,
                      shortcut: shortcutHints['game.moveTopUntil'],
                    },
                    { divider: true },
                    {
                      label: 'Shuffle top cards...',
                      onClick: () => {
                        const size = deckCount;
                        if (!onShuffleRange || size <= 0) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Shuffle top cards',
                          submitLabel: 'Shuffle',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            // Command_Shuffle range is inclusive on
                            // both ends: [0, N-1] shuffles positions
                            // 0..N-1 (player_actions.cpp:267-268).
                            onShuffleRange(0, count - 1);
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                  ],
                },
                {
                  // "Bottom of library..." — Cockatrice's LibraryMenu
                  // bottomLibraryMenu (library_menu.cpp:64-78). Bottom
                  // single-card items address `cardId = deckCount-1`
                  // (cmdSetBottomCard, player_actions.cpp:384); the
                  // multi-card actions iterate positions
                  // `maxCards-N..maxCards-1` (moveBottomCardsTo,
                  // :673). Shuffle bottom is encoded on the wire as
                  // `[-N, -1]` — negative indices count from the end
                  // (:298-299).
                  label: 'Bottom of library...',
                  disabled: deckCount <= 0,
                  submenu: [
                    {
                      label: 'Draw bottom card',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.HAND });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Draw bottom cards...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Draw bottom cards',
                          submitLabel: 'Draw',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            // Cockatrice iterates i in
                            // [maxCards-N..maxCards-1] (actDrawBottomCards
                            // :798-800) — natural order, unlike top-N
                            // which reverses. Preserve that ordering
                            // so any downstream log/replay tooling
                            // matches desktop.
                            const cards: SeatMoveCard[] = [];
                            for (let i = size - count; i < size; i++) {
                              cards.push(i);
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.HAND });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Play bottom card',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.STACK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Play bottom card face down',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [{ id: deckCount - 1, faceDown: true }], {
                            zone: ZoneName.TABLE,
                            index: 'end',
                          });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Put bottom card on top',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.DECK });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Move bottom card to graveyard',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.GRAVE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom cards to graveyard...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move bottom cards to graveyard',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = size - count; i < size; i++) {
                              cards.push(i);
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label:
                          'Move bottom cards to graveyard face down...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title:
                              'Move bottom cards to graveyard face down',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = size - count; i < size; i++) {
                              cards.push({ id: i, faceDown: true });
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom card to exile',
                      onClick: () => {
                        if (onMoveCards && deckCount > 0) {
                          onMoveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.EXILE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom cards to exile...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move bottom cards to exile',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = size - count; i < size; i++) {
                              cards.push(i);
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom cards to exile face down...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          !onMoveCards ||
                            size <= 0
                        ) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Move bottom cards to exile face down',
                          submitLabel: 'Move',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            const cards: SeatMoveCard[] = [];
                            for (let i = size - count; i < size; i++) {
                              cards.push({ id: i, faceDown: true });
                            }
                            onMoveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Shuffle bottom cards...',
                      onClick: () => {
                        const size = deckCount;
                        if (!onShuffleRange || size <= 0) {
                          return;
                        }
                        setCountPrompt({
                          title: 'Shuffle bottom cards',
                          submitLabel: 'Shuffle',
                          deckSize: size,
                          onSubmit: (n) => {
                            const count = Math.min(n, size);
                            if (count <= 0) {
                              return;
                            }
                            // `[-N, -1]` — negative indices count from
                            // the end (server accepts either sign;
                            // Cockatrice desktop always sends negative
                            // for bottom, :298-299).
                            onShuffleRange(-count, -1);
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                  ],
                },
                { divider: true },
                {
                  // Webatrice divergence from Cockatrice desktop:
                  // instead of reconstructing the deck in-app, we
                  // route to the same `/deck/:id` page a My Decks
                  // row-click opens. Disabled when the game's deck
                  // doesn't match any of the user's saved decks
                  // (name-based lookup happens in GameBoardCell —
                  // undefined callback ⇒ menu item disabled).
                  label: 'Open deck in deck editor',
                  onClick: onOpenDeckInEditor,
                  disabled: !onOpenDeckInEditor,
                },
              ]}
            >
              <CardBackZone
                ref={libraryZoneRef}
                label="Library"
                count={displayedDeckCount}
                // Pile face: show whatever `deckTopCard` is currently
                // populated to. The state itself is the guard — the
                // datatrice cardsRevealed reducer only sets
                // topRevealedCard when the receiver is in the
                // reveal audience (owner for always-look-at,
                // everyone for always-reveal), and top-changing
                // listeners clear it when the position 0 card
                // moves. Toggling off does NOT clear — matches
                // Cockatrice desktop's "keep revealed face
                // visible until top actually changes" behavior.
                topCard={deckTopCard ?? null}
                onPointerDown={
                  displayedDeckCount > 0
                    ? (e) =>
                      startPileDrag(
                        e,
                        LIBRARY_TOP_DRAG_PAYLOAD,
                        'library',
                      )
                    : undefined
                }
              />
            </ContextMenu>
          ) : (
          // Opponent's library — Cockatrice does nothing on
          // right-click here; skip the ContextMenu wrapper entirely.
          // Wrapping div (not raw <CardBackZone>) preserves the same
          // DOM shape the layout above expected from <ContextMenu>.
            <div>
              <CardBackZone
                ref={libraryZoneRef}
                label="Library"
                count={displayedDeckCount}
                // Opponent pile: same principle as the own-pile
                // render above. State is the guard — we only have
                // deckTopCard populated when the opponent had
                // always-reveal on (their private "look at"
                // reveals never reach us).
                topCard={deckTopCard ?? null}
              />
            </div>
          )}
          {isSelf ? (
            <ContextMenu items={graveMenuItemsSelf}>
              <LargeZoneBox
                ref={graveyardZoneRef}
                icon={Skull}
                label="Graveyard"
                count={displayedGraveyardCount}
                topCard={graveyardTop}
                arrowAnchorPlayerId={playerId}
                arrowAnchorZone={ZoneName.GRAVE}
                onPointerDown={
                  graveDisplayList.length > 0
                    ? (e) =>
                      startPileDrag(
                        e,
                        graveDisplayList[graveDisplayList.length - 1],
                        'graveyard',
                      )
                    : undefined
                }
              />
            </ContextMenu>
          ) : (
          // Opponent's graveyard — GraveyardMenu gates the move /
          // reveal-random submenus behind local-or-judge
          // (grave_menu.cpp:19,42); every player still gets "View
          // graveyard" since the zone is public.
            <ContextMenu items={graveMenuItemsOpponent}>
              <LargeZoneBox
                ref={graveyardZoneRef}
                icon={Skull}
                label="Graveyard"
                count={displayedGraveyardCount}
                topCard={graveyardTop}
                arrowAnchorPlayerId={playerId}
                arrowAnchorZone={ZoneName.GRAVE}
              />
            </ContextMenu>
          )}
          {isSelf ? (
            <ContextMenu items={exileMenuItemsSelf}>
              <LargeZoneBox
                ref={exileZoneRef}
                icon={Sparkles}
                label="Exile"
                count={displayedExileCount}
                topCard={exileTop}
                arrowAnchorPlayerId={playerId}
                arrowAnchorZone={ZoneName.EXILE}
                onPointerDown={
                  exileDisplayList.length > 0
                    ? (e) =>
                      startPileDrag(
                        e,
                        exileDisplayList[exileDisplayList.length - 1],
                        'exile',
                      )
                    : undefined
                }
              />
            </ContextMenu>
          ) : (
          // Opponent's exile — RfgMenu gates move behind local-or-judge
          // (rfg_menu.cpp:16); "View exile" is available to any viewer.
            <ContextMenu items={exileMenuItemsOpponent}>
              <LargeZoneBox
                ref={exileZoneRef}
                icon={Sparkles}
                label="Exile"
                count={displayedExileCount}
                topCard={exileTop}
                arrowAnchorPlayerId={playerId}
                arrowAnchorZone={ZoneName.EXILE}
              />
            </ContextMenu>
          )}
        </div>
      </div>

      {/* Stack column — sits in the play row (opposite the hand). Only
          the battlefield is mirrored for top-row boxes; the stack
          always renders in the same orientation. */}
      <div
        className="border-r border-border-subtle flex flex-col min-h-0 p-2"
        style={{ gridColumn: 2, gridRow: handOnTop ? 2 : 1 }}
      >
        {/* Stack — spells/abilities waiting to resolve. Cards zig-zag
            vertically; index 0 renders topmost. Dropping between two
            existing cards inserts at that position. */}
        <div ref={stackZoneRef} className="flex-1 min-h-0 relative">
          {(() => {
            const visible = stackDisplayList.filter(
              (c) => !isDragging(c.id, 'stack'),
            );
            const positions = layoutStackPile(
              visible.length,
              stackSize.w,
              stackSize.h,
              CARD_W_PX,
              CARD_H_PX,
              STACK_HOFFSET_PX,
            );
            return visible.map((c, i) => {
              const pos = positions[i];
              if (!pos) {
                return null;
              }
              const selected =
                selection?.zone === 'stack' && selection.ids.has(c.id);
              return (
                <div
                  key={c.id}
                  data-card
                  data-zone="stack"
                  data-card-id={c.id}
                  data-selected={selected || undefined}
                  // Same arrow-interaction attrs as battlefield cards
                  // so useGameArrowInteractions can hit-test stack
                  // cards as arrow sources AND arrow targets
                  // (counterspells, on-stack triggers, etc.).
                  data-card-owner={playerId}
                  data-card-zone={ZoneName.STACK}
                  onPointerDown={(e) =>
                    startSeatCardDrag(e, c, 'stack', stackDisplayList)
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openSeatCardMenu({
                      kind: 'stack',
                      playerId: menuOwnerId,
                      cardId: c.id,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onDoubleClick={
                    isSelf
                      ? async () => {
                        // Resolves the second step of the auto-play chain:
                        // an instant/sorcery on the stack goes to the
                        // graveyard; anything else (creature / other
                        // permanent / unknown) lands on the battlefield at
                        // the tablerow-appropriate row. Card type comes
                        // from the prefetched cache; on cache miss we
                        // block on a fresh lookup so the first click
                        // routes correctly. Wire x = -1 lets the server
                        // pick a column.
                        const cardId = Number(c.id);
                        if (
                          !Number.isFinite(cardId) ||
                          !onMoveCards
                        ) {
                          return;
                        }
                        let typeLine =
                          cardMetaByName.get(c.name)?.typeLine ??
                          cards.find((dc) => dc.name === c.name)?.type_line ??
                          '';
                        if (!typeLine) {
                          const r = await lookupCard(c.name);
                          typeLine = r.typeLine ?? '';
                          const pt =
                            r.power != null && r.toughness != null
                              ? `${r.power}/${r.toughness}`
                              : undefined;
                          if (typeLine || pt) {
                            setCardMetaByName((prev) => {
                              const existing = prev.get(c.name);
                              if (
                                existing?.typeLine === typeLine &&
                                existing?.pt === pt
                              ) {
                                return prev;
                              }
                              const next = new Map(prev);
                              next.set(c.name, { typeLine, pt });
                              return next;
                            });
                          }
                        }
                        const tableRow = legacyTableRowFromTypeLine(typeLine);
                        if (tableRow === 3) {
                          onMoveCards(ZoneName.STACK, [cardId], { zone: ZoneName.GRAVE, index: 'end' });
                        } else {
                          onMoveCards(ZoneName.STACK, [cardId], { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(tableRow) });
                        }
                      }
                      : undefined
                  }
                  className="absolute hover:z-10"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    touchAction: isSelf ? 'none' : undefined,
                    cursor: isSelf ? 'grab' : 'default',
                    boxShadow: selected
                      ? '0 0 0 2px rgb(59 130 246), 0 0 12px 2px rgb(59 130 246 / 0.6)'
                      : undefined,
                    borderRadius: CARD_CORNER_RADIUS,
                  }}
                >
                  <Card
                    name={c.name}
                    scryfallId={
                      c.scryfallId
                      || cardMetaByName.get(c.name)?.scryfallId
                    }
                    pt={cardMetaByName.get(c.name)?.pt}
                    // Stack keeps annotations while other non-battlefield
                    // zones don't (Cockatrice's `keepAnnotations =
                    // (targetzone == STACK)` carve-out). Show the tag
                    // — usually "Owner: <name>" — so the caster stays
                    // visible while the spell sits on the stack.
                    annotation={c.annotation}
                  />
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Battlefield — sits in the play row (opposite the hand). The inner
          scroll container measures the fit area (how many columns fit
          on-screen). The battlefield content div has an explicit pixel
          size that expands past the fit as cards are placed on the right
          buffer column, triggering horizontal scroll. Padding equals the
          card gap so the visual "frame" around the battlefield matches
          the spacing between cards.
          Own battlefield gets Cockatrice's PlayerMenu on right-click
          (player_menu.cpp:60-62). Opponent boards get the narrower
          view-only menu (Graveyard / Exile submenus only) since
          Cockatrice hides every utility item behind the isLocal gate. */}
      <ContextMenu
        items={isSelf ? battlefieldMenuItems : opponentBattlefieldMenuItems}
        wrapperClassName="min-h-0 relative"
        wrapperStyle={{ gridColumn: 3, gridRow: handOnTop ? 2 : 1 }}
      >
        {playerId != null && <PlayerPlaymat playerId={playerId} isSelf={isSelf} />}
        {/* Lands divider — spans the full width of the play area,
            ignoring the padding around the scrollable battlefield content
            so it reads as a continuous horizontal line across the box.
            Sits in the gap ABOVE the lands row (visual bottom for self,
            visual top for mirrored opponent boards). */}
        {BATTLEFIELD_ROWS >= 2 &&
          (() => {
            // The lands row is the visual row nearest the OWNER's hand.
            // Webatrice's wire y semantics (see playCard.ts) put creatures
            // at wireY=0 and lands at wireY=2, so:
            //   • self (handOnTop=false): lands render at bottom (row 2)
            //   • opponent (handOnTop=true, mirrored): lands render at top
            //     (visual row 0, since mirroring flips wireY=2 → row 0)
            // Draw the divider in the row-gap ABOVE (self) or BELOW
            // (opponent) the lands row.
            const dividerAboveRow = handOnTop ? 1 : 2;
            const dividerY =
              rowTopY(dividerAboveRow, battlefieldLayout) -
              BATTLEFIELD_ROW_PADDING_PX / 2;
            return (
              <div
                className="absolute left-0 right-0 border-t border-border-strong/60 pointer-events-none"
                style={{ top: `${dividerY}px` }}
              />
            );
          })()}
        <div
          ref={battlefieldScrollRef}
          data-battlefield-owner={player.user_id}
          data-battlefield-mirrored={handOnTop ? 'true' : 'false'}
          // Cockatrice-style layout: the outer scroll container has no
          // padding. Left/right/top margins are already baked into the
          // content div's card + slot positions via BATTLEFIELD_MARGIN_*
          // constants in the layout helpers, so adding container padding
          // would double up the inset and shrink the visible column
          // count for no visual gain.
          className="absolute inset-0 overflow-x-auto overflow-y-hidden box-border"
        >
          <div
            ref={battlefieldRef}
            data-battlefield-content
            // Cross-battlefield snap reads this to reconstruct per-column
            // widths when a card is dragged over another player's board.
            // JSON.stringify on a Map returns [], so materialize entries
            // first. Cheap even for a few hundred cards.
            data-cell-widths={JSON.stringify(Array.from(cellWidths.entries()))}
            className="relative"
            // Absolute-positioned children (cards + slot outlines) sit at
            // pixel coordinates computed from cellWidths + rowTopY. The
            // content div's own size is set to the sum of per-column
            // widths + margins (Cockatrice-style): if the natural size is
            // smaller than the container, empty space appears on the right
            // (no more spread-to-fit); if larger, the container scrolls.
            // `zIndex: 0` forces a stacking context so card z-indexes
            // (`y*100 + x`, easily in the tens of thousands) are confined
            // to this scope rather than leaking into the parent stacking
            // context and outranking the hand wrapper's z-30. Without
            // this, hovered hand cards slid up into the play area but
            // painted BEHIND battlefield cards.
            style={{
              width: `${naturalContentW}px`,
              height: `${naturalContentH}px`,
              zIndex: 0,
            }}
          >
            <SeatDropPreview dropId={`seat-${seatId}-battlefield`}>
              {(target) => (
                <BattlefieldSlotOverlay
                  cellWidths={cellWidths}
                  colsByRow={colsByRow}
                  layout={battlefieldLayout}
                  mirrored={handOnTop}
                  // The drop target's row is in wire orientation; the
                  // overlay paints in display orientation.
                  highlightedSlot={
                    target?.zone === 'battlefield'
                      ? {
                        row: handOnTop ? BATTLEFIELD_ROWS - 1 - target.slot.row : target.slot.row,
                        col: target.slot.col,
                      }
                      : null
                  }
                />
              )}
            </SeatDropPreview>
            {(() => {
            // Group cards by slot for insertion-order stacking. For
            // server-authoritative cards `subSlot` carries the true
            // stack index (from `wire_x % 3`); for the drop-to-ack
            // window we fall back to the group's insertion index so
            // multiple optimistic drops on the same slot don't overlap.
              const groups = new Map<string, string[]>();
              for (const c of battlefieldDisplayList) {
                const key = `${c.slot.row},${c.slot.col}`;
                const list = groups.get(key) ?? [];
                list.push(c.id);
                groups.set(key, list);
              }
              return battlefieldDisplayList.map((c) => {
              // Position resolved from the shared `battlefieldPositions`
              // map above: parents get shifted to accommodate children,
              // attached children fan diagonally under their parent, and
              // free cards fall back to slotOriginPx. See the
              // battlefieldPositions builder for the full algorithm.
                const origin = battlefieldPositions.get(c.id) ?? {
                  x: 0,
                  y: 0,
                };
                const dragging = isDragging(c.id, 'battlefield');
                const selected =
                selection?.zone === 'battlefield' && selection.ids.has(c.id);
                // Attach source ring — green while pending so the user
                // can see which cards they're about to attach. Primary
                // source drives the pending arrow anchor; extras (from a
                // multi-selection attach) get the ring too.
                const cardIdNum = Number(c.id);
                const isAttachSource =
                attachPending != null &&
                (cardIdNum === attachPending.sourceCardId ||
                  attachExtraSourceIds.includes(cardIdNum));
                return (
                  <div
                    key={c.id}
                    data-card
                    data-zone="battlefield"
                    data-card-id={c.id}
                    data-selected={selected || undefined}
                    // Arrow interaction: the useGameArrowInteractions hook
                    // hit-tests via `data-card-owner` + `data-card-zone`
                    // during right-click-drag, and the GameArrowOverlay
                    // resolves committed arrow endpoints against the same
                    // attributes. Zone value is the Cockatrice wire name
                    // (`ZoneName.TABLE`) so the DOM lookup matches the
                    // server's start/target_zone strings.
                    data-card-owner={playerId}
                    data-card-zone={ZoneName.TABLE}
                    // Hover uses an arbitrary z far above the position-
                    // derived base so a mid-battlefield hover always pops
                    // to the top regardless of Y stacking.
                    className="absolute hover:z-[10000]"
                    onPointerDown={(e) =>
                    // Pass the FULL BattlefieldCard object (not a
                    // stripped `{id, name, scryfallId}` projection):
                    // the drag ghost casts `drag.cards` back to
                    // BattlefieldCard to render annotation / PT /
                    // counters / faceDown / tapped rotation. Since
                    // BattlefieldCard extends HandCard structurally,
                    // this widens cleanly at the call site.
                      startSeatCardDrag(e, c, 'battlefield', battlefieldDisplayList)
                    }
                    onContextMenu={
                      c
                        ? (e) => {
                          e.preventDefault();
                          // Stop the event from bubbling up to the
                          // battlefield's ContextMenu wrapper — otherwise
                          // right-clicking a card opens both the card menu
                          // AND the player menu at the same position.
                          // Also opens for opponent cards; the menu render
                          // below branches on isSelf between the full owner
                          // menu and Cockatrice's minimal opponent menu
                          // (Draw arrow / Clone / Select / Reduce life by
                          // power / View related cards — card_menu.cpp:183).
                          e.stopPropagation();
                          openSeatCardMenu({
                            kind: 'battlefield',
                            playerId: menuOwnerId,
                            cardId: c.id,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                        : undefined
                    }
                    onDoubleClick={
                      isSelf
                        ? () => {
                          // If the double-clicked card belongs to the
                          // current marquee selection on THIS battlefield,
                          // tap/untap every selected card together.
                          const groupTap =
                            selection?.zone === 'battlefield' &&
                            selection.ids.has(c.id);
                          const targetIds = groupTap
                            ? selection.ids
                            : new Set([c.id]);
                          const nextTapped = !c.tapped;
                          // Wire dispatch: one Command_SetCardAttr per
                          // card. Server broadcasts Event_SetCardAttr
                          // back and Redux flips `tapped` — no local
                          // mutation needed.
                          const wireIds: number[] = [];
                          targetIds.forEach((id) => {
                            const n = Number(id);
                            if (Number.isFinite(n)) {
                              wireIds.push(n);
                            }
                          });
                          if (wireIds.length > 0) {
                            onSetCardTapped?.(wireIds, nextTapped);
                          }
                        }
                        : undefined
                    }
                    style={{
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      left: `${origin.x}px`,
                      top: `${origin.y}px`,
                      // Position-derived stacking: higher-Y cards render on
                      // top. This is what makes attached parents (y = base+15)
                      // sit visually ABOVE their children (y = base+5) — the
                      // parent's full art shows, children peek out from the
                      // fan. Ports Cockatrice's `ZValues::tableCardZValue`
                      // formula from z_values.h:72-75; without it, DOM order
                      // decides and children played after the parent stomp on
                      // top of it.
                      zIndex: Math.round(origin.y * 100) + Math.round(origin.x),
                      touchAction: isSelf ? 'none' : undefined,
                      cursor: attachPending
                        ? 'crosshair'
                        : isSelf
                          ? 'grab'
                          : 'default',
                      opacity: dragging ? 0 : 1,
                      // Ring priority (outer overrides inner visually):
                      //   • attach source → green (Cockatrice's arrow color)
                      //   • marquee-selected → blue
                      //   • doesntUntap → amber
                      // When multiple apply they layer, but attach-source
                      // takes visual precedence since it's the ephemeral
                      // "you're mid-flow" cue.
                      boxShadow: isAttachSource
                        ? '0 0 0 3px rgb(34 197 94), 0 0 16px 3px rgb(34 197 94 / 0.75)'
                        : selected
                          ? c.doesntUntap
                            ? '0 0 0 2px rgb(59 130 246), 0 0 0 4px rgb(251 191 36), 0 0 12px 2px rgb(251 191 36 / 0.7)'
                            : '0 0 0 2px rgb(59 130 246), 0 0 12px 2px rgb(59 130 246 / 0.6)'
                          : c.doesntUntap
                            ? '0 0 0 2px rgb(251 191 36), 0 0 10px 2px rgb(251 191 36 / 0.6)'
                            : undefined,
                      borderRadius: CARD_CORNER_RADIUS,
                      // Tapped cards rotate 90° clockwise in place.
                      // transform-origin: center keeps the pivot at the
                      // card's midpoint so it doesn't drift off its slot.
                      transform: c.tapped ? 'rotate(90deg)' : undefined,
                      transformOrigin: 'center',
                      transition: tapAnimation ? 'transform 150ms ease-out' : undefined,
                    }}
                  >
                    <Card
                      name={c.name}
                      scryfallId={
                        c.scryfallId
                        || cardMetaByName.get(c.name)?.scryfallId
                      }
                      id={c.id}
                      faceDown={c.faceDown}
                      // Prefer the server's `pt` (initial value from
                      // `playCard` or an `AttrPT` change); fall back to
                      // the prefetched base P/T from the Scryfall
                      // lookup cache so untouched creatures still
                      // show their printed stats. Face-down cards keep
                      // whatever PT the server has recorded so a manifested
                      // creature's stats stay readable (Cockatrice does
                      // the same).
                      pt={c.pt || (c.faceDown ? undefined : cardMetaByName.get(c.name)?.pt)}
                      basePT={cardMetaByName.get(c.name)?.pt}
                      annotation={c.annotation}
                      counters={c.counters}
                      imageUri={resolveFaceImageUri(c.name)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </ContextMenu>

      {/* Hand — every player gets one; row flips based on handOnTop.
           Idle: overflow-hidden clips cards to half their height so
           the hand row only occupies half a card of vertical space.
           Hovered: overflow-visible + z-30 lets cards render at full
           height, floating over the play area WITHOUT reflowing the
           grid (the reserved row height doesn't change). Alignment
           per row direction so the visible half always sits toward
           the screen edge and expansion goes toward the play area:
             • Bottom hand: items-end → bottom half visible, top half
               overflows upward into the play area on hover.
             • Top hand:    items-start → top half visible, bottom
               half overflows downward into the play area on hover. */}
      {/* Nested structure — two problems solved:
             1. CSS silently promotes overflow-visible to auto when
                the other axis is auto/hidden, spawning a vertical
                scrollbar. Splitting vertical vs horizontal overflow
                across nested elements avoids the promotion.
             2. On hover, the bottom hand needs to "slide up" so the
                top half stays visible while the bottom half now sits
                inside the strip and the top half floats into the
                play area above. That's the transform on the inner
                container (top hand doesn't need it — its natural
                overflow direction IS toward the play area).
           Layout invariant: cards render top-aligned in the strip so
           the TOP half of every card (name / mana / art — the part
           you actually need to read) is what's visible in idle. */}
      <div
        className={[
          'min-h-0 flex',
          // For flipped opponent hands, use items-end so the rotated
          // card back's BOTTOM (which is the original TOP with the
          // Magic logo) sits in the visible strip. Everything else
          // (own hand + non-flipped 3-player opponent) stays
          // top-aligned, matching the local invariant that the
          // card's readable half occupies the strip.
          handOnTop && flipHandCardBacks ? 'items-end' : 'items-start',
          handOnTop ? 'border-b border-border-subtle' : 'border-t border-border-subtle',
          // Keep overflow-visible while the slide tween is mid-flight
          // too, otherwise the wrapper clips its own cards halfway
          // through the return-to-idle animation and it reads as a
          // z-index pop.
          (handExpanded || handAnimating) ? 'overflow-visible' : 'overflow-hidden',
        ].join(' ')}
        style={{
          gridColumn: '2 / 4',
          gridRow: handOnTop ? 1 : 2,
          // Always elevated above the play area so overflowing cards
          // paint on top when the hand expands. Kept static (not tied
          // to hover) so nothing flickers at the boundary.
          position: 'relative',
          zIndex: 30,
        }}
      >
        {/* Hand icon + count badge overlay. Top-left of the hand
            zone for every player. Right-click on the OWN button
            opens the hand context menu (ports Cockatrice's HandMenu
            — see handMenuItems above). Opponent buttons are inert
            (Cockatrice doesn't offer a menu on opponent hands
            either — you can't act on cards you can't see). The
            wrapper ContextMenu only mounts for isSelf, so
            right-clicking an opponent's button produces no popup
            (the browser default is also suppressed on the button's
            own onContextMenu). z-40 sits above the expanded hand's
            z-30 so the button stays clickable when cards float up
            on hover. */}
        {isSelf ? (
          <ContextMenu items={handMenuItems}>
            <button
              type="button"
              className={
                'absolute top-1 left-1 z-40 flex items-center justify-center '
                + 'h-14 w-14 rounded bg-bg-surface/80 hover:bg-bg-elevated '
                + 'border border-border-subtle text-text-primary '
                + 'shadow transition-colors cursor-default'
              }
              title={`Hand — ${handSize} card${handSize === 1 ? '' : 's'}`}
              onContextMenu={(e) => {
                // ContextMenu's own onContextMenu on its wrapper div
                // handles the popup; suppress the button's default
                // context menu so nothing else fires.
                e.preventDefault();
              }}
              onClick={(e) => {
                // Left-click also opens the menu. The ContextMenu
                // wrapper only listens for `contextmenu` events on
                // its own div, so we synthesize one at this button's
                // location and dispatch it upward — the wrapper's
                // handler catches it and sets `position` to the
                // supplied clientX/clientY, opening the popup at
                // the same spot a right-click would.
                e.preventDefault();
                const evt = new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: e.clientX,
                  clientY: e.clientY,
                });
                e.currentTarget.dispatchEvent(evt);
              }}
            >
              <Hand size={32} className="text-text-secondary" aria-hidden />
              <span
                className={
                  'absolute inset-0 flex items-center justify-center '
                  + 'text-[1.3rem] font-bold text-text-primary '
                  + 'pointer-events-none tabular-nums'
                }
                style={{ textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
              >
                {handSize}
              </span>
            </button>
          </ContextMenu>
        ) : (
          <button
            type="button"
            disabled
            className={
              'absolute top-1 left-1 z-40 flex items-center justify-center '
              + 'h-14 w-14 rounded bg-bg-surface/80 border border-border-subtle '
              + 'text-text-primary shadow cursor-default'
            }
            title={`Hand — ${handSize} card${handSize === 1 ? '' : 's'}`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Hand size={32} className="text-text-secondary" aria-hidden />
            <span
              className={
                'absolute inset-0 flex items-center justify-center '
                + 'text-[1.3rem] font-bold text-text-primary '
                + 'pointer-events-none tabular-nums'
              }
              style={{ textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }}
            >
              {handSize}
            </span>
          </button>
        )}
        {/* Inner row — full card height so cards render at their true
            size; the outer wrapper clips the half we don't want to see
            in idle mode. On hover, a translateY on this container
            slides the whole card content upward for the bottom hand
            (top hand stays put — its expansion is downward and
            handled by the outer's overflow flip alone). */}
        <motion.div
          ref={handZoneRef}
          data-testid={`hand-zone-${playerId}`}
          // `overflow-y-hidden` set explicitly alongside overflow-x-auto
          // to short-circuit the CSS spec's promotion of the other
          // axis to `auto` — that's what was spawning a phantom
          // vertical scrollbar even though cards fit exactly.
          className='w-full flex items-center overflow-x-auto overflow-y-hidden'
          style={{ height: CARD_HEIGHT }}
          // Own hand slides UP on hover (top half of card floats
          // into the play area above, bottom half comes into the
          // strip). Flipped opponent hand mirrors that, sliding
          // DOWN on hover so the card back's original TOP (with
          // Magic logo) drops into the play area below and the
          // rotated top comes into the strip. Non-flipped
          // (3-player) opponent has no transform — its expansion
          // is a plain overflow reveal downward. Framer Motion
          // drives the tween via WAAPI so it interrupts cleanly on
          // fast hover-in/out (the CSS-transition version had to
          // finish before it could reverse) and auto-promotes to
          // the compositor.
          animate={{
            y: handExpanded
              ? !handOnTop
                ? '-40%'
                : flipHandCardBacks
                  ? '40%'
                  : '0%'
              : '0%',
          }}
          // Spring feels snappier than a fixed-duration tween because
          // it front-loads the motion. Tuned for a quick, damped
          // response — no overshoot bounce, settles in ~180ms.
          transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }}
          // Flip the `handAnimating` flag around the tween so the outer
          // wrapper keeps `overflow-visible` for the whole slide-back
          // instead of clipping cards mid-flight.
          onAnimationStart={() => setHandAnimating(true)}
          onAnimationComplete={() => setHandAnimating(false)}
        >
          {/* Static hand — the owner sees the real card faces; everyone else
            sees face-down card backs (one per card the server says
            they're holding). `m-auto` on the inner row centers the
            cards when they fit and collapses to 0 when they don't —
            unlike `justify-center`, this leaves the leading edge
            reachable when the hand overflows and needs to scroll. */}
          {isSelf
            ? handDisplayList.length > 0 && (
              <div
                onMouseEnter={() => setHandExpanded(true)}
                onMouseLeave={() => setHandExpanded(false)}
                className='flex items-center gap-1 m-auto px-1 bg-bg-surface/40'
              >
                {handDisplayList.map((c) => {
                  const dragging = isDragging(c.id, 'hand');
                  const selected =
                    selection?.zone === 'hand' && selection.ids.has(c.id);
                  return (
                    <div
                      key={c.id}
                      data-card
                      data-zone="hand"
                      data-card-id={c.id}
                      data-selected={selected || undefined}
                      onPointerDown={(e) =>
                        startSeatCardDrag(e, c, 'hand', handDisplayList)
                      }
                      onDoubleClick={async () => {
                        // Double-click auto-play chain: lands go straight to
                        // the battlefield; everything else takes a stack
                        // detour so spells are visible before resolving
                        // (permanents skip it when playToStack is off). The
                        // stack card itself has its own double-click handler
                        // that resolves the second step (instant/sorcery →
                        // graveyard, permanent → battlefield). Card type
                        // comes from the prefetched cache; on cache miss we
                        // block on a fresh lookup so the first click routes
                        // correctly even if prefetch hasn't completed. Wire
                        // x = -1 lets the server pick a column.
                        const cardId = Number(c.id);
                        if (
                          !Number.isFinite(cardId) ||
                          !onMoveCards
                        ) {
                          return;
                        }
                        let typeLine =
                          cardMetaByName.get(c.name)?.typeLine ??
                          cards.find((dc) => dc.name === c.name)?.type_line ??
                          '';
                        if (!typeLine) {
                          const r = await lookupCard(c.name);
                          typeLine = r.typeLine ?? '';
                          const pt =
                            r.power != null && r.toughness != null
                              ? `${r.power}/${r.toughness}`
                              : undefined;
                          if (typeLine || pt) {
                            setCardMetaByName((prev) => {
                              const existing = prev.get(c.name);
                              if (
                                existing?.typeLine === typeLine &&
                                existing?.pt === pt
                              ) {
                                return prev;
                              }
                              const next = new Map(prev);
                              next.set(c.name, { typeLine, pt });
                              return next;
                            });
                          }
                        }
                        const tableRow = legacyTableRowFromTypeLine(typeLine);
                        // Desktop PlayerActions::playCard: lands go to the
                        // battlefield and instants/sorceries to the stack;
                        // other permanents take the stack only with "Play
                        // all nonlands onto the stack" on (the default).
                        if (tableRow === 0 || (tableRow !== 3 && !playToStack)) {
                          onMoveCards(ZoneName.HAND, [cardId], { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(tableRow) });
                        } else {
                          // Detour through the stack so the spell is visible
                          // before it resolves.
                          onMoveCards(ZoneName.HAND, [cardId], { zone: ZoneName.STACK, index: 'end' });
                        }
                      }}
                      style={{
                        touchAction: 'none',
                        cursor: 'grab',
                        opacity: dragging ? 0 : 1,
                        boxShadow: selected
                          ? '0 0 0 2px rgb(59 130 246), 0 0 12px 2px rgb(59 130 246 / 0.6)'
                          : undefined,
                        borderRadius: CARD_CORNER_RADIUS,
                      }}
                    >
                      <Card
                        name={c.name}
                        // Prefer any scryfallId we've already resolved
                        // via the Scryfall metadata cache — the wire's
                        // `c.scryfallId` is empty when the deck was
                        // uploaded without per-card `uuid` attributes,
                        // which forces Card.tsx to hit
                        // /cards/named?exact= for the image. That
                        // endpoint is rate-limited; several hand
                        // cards fetching in parallel at game start
                        // means some silently 429 and never retry.
                        // The batched cardMetaByName lookup gives us
                        // a real id → CDN path with no rate limit.
                        scryfallId={
                          c.scryfallId
                          || cardMetaByName.get(c.name)?.scryfallId
                        }
                        pt={cardMetaByName.get(c.name)?.pt}
                      />
                    </div>
                  );
                })}
              </div>
            )
            : handCount > 0 && (
              <div
                onMouseEnter={() => setHandExpanded(true)}
                onMouseLeave={() => setHandExpanded(false)}
                className='flex items-center gap-1 m-auto px-1 bg-bg-surface/40'
              >
                {Array.from({ length: handCount }, (_, i) => (
                  <img
                    key={i}
                    src={CARD_BACK_URL}
                    alt=""
                    draggable={false}
                    className="shadow-md pointer-events-none select-none"
                    style={{
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      borderRadius: CARD_CORNER_RADIUS,
                      // Only rotate 180° when this player's hand renders
                      // at the TOP of their PlayerBox (handOnTop). A
                      // bottom-row opponent in a 4-player layout has
                      // flipHandCardBacks=true (the per-count flag) but
                      // handOnTop=false — their hand is at the bottom of
                      // the screen where a natural orientation reads
                      // correctly. Without the handOnTop gate, those
                      // cards render upside-down.
                      transform: (handOnTop && flipHandCardBacks) ? 'rotate(180deg)' : undefined,
                    }}
                  />
                ))}
              </div>
            )}
        </motion.div>
      </div>

      {/* Draw animations — a card back tweens from the library rect
          (rotated to match the sideways pile) to the hand rect (upright)
          each time Redux hand count grows. Purely visual: the drawn
          card is already in Redux; this just adds the "flight" polish. */}
      {flights.length > 0 &&
        createPortal(
          <>
            {flights.map((f) => {
              const style: React.CSSProperties = {
                position: 'fixed',
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: CARD_CORNER_RADIUS,
                transition:
                  `left ${DRAW_ANIMATION_MS}ms ease-out, top ${DRAW_ANIMATION_MS}ms ease-out, `
                  + `transform ${DRAW_ANIMATION_MS}ms ease-out`,
                pointerEvents: 'none',
                zIndex: 200,
                willChange: 'left, top, transform',
              };
              if (!f.landed) {
                style.left = f.from.left + f.from.width / 2;
                style.top = f.from.top + f.from.height / 2;
                style.transform = 'translate(-50%, -50%) rotate(-90deg)';
              } else {
                style.left = f.to.left + f.to.width / 2;
                style.top = f.to.top + f.to.height / 2;
                style.transform = 'translate(-50%, -50%) rotate(0deg)';
              }
              return (
                <img
                  key={f.id}
                  src={CARD_BACK_URL}
                  alt=""
                  draggable={false}
                  className="shadow-glow"
                  style={style}
                />
              );
            })}
          </>,
          document.body,
        )}

      {/* Marquee selection rectangle. Fixed-position overlay so it can
          straddle scrollable containers without clipping. */}
      {marquee &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
              border: '1px dashed rgb(59 130 246)',
              background: 'rgb(59 130 246 / 0.12)',
              pointerEvents: 'none',
              zIndex: 275,
            }}
          />,
          document.body,
        )}

      {/* Library search dialog — full-deck reveal. Cards come from Redux
          `revealedDeckCards` (populated by Response_DumpZone when
          "View library" opens above). On close, optionally fires
          Command_Shuffle (shuffle-on-close checkbox default checked
          per Cockatrice) and always clears the revealed snapshot.

          The .cod-parsed DeckCards ship with type_line/cmc/colors/pt
          set to null (parsedDeckToMockCards), so backfill each field
          from `cardMetaByName` (Dexie / Scryfall lookup) before
          passing. Without this, "Group by Type" would bucket every
          card into "Other" and "Sort by CMC" would treat everything
          as 0. */}
      <LibrarySearchDialog
        isOpen={librarySearchOpen}
        onClose={(shuffleOnClose) => {
          setLibrarySearchOpen(false);
          if (shuffleOnClose) {
            onShuffle?.();
          }
          onClearRevealedDeck?.();
        }}
        library={revealedDeckCards ?? []}
        deckCards={enrichedDeckCards}
        playerName={name}
        dropRef={librarySearchDialogZoneRef}
        // Pointer-down on a card in the dialog kicks off a normal
        // library-source drag. The card's id is the revealed-card's
        // server-side deck position, which the wire path forwards
        // verbatim as Command_MoveCard.cardId.
        onCardPointerDown={
          isSelf
            ? (e, c) => librarySearchDragSource(e, [c])
            : undefined
        }
        draggingCardIds={draggingIdsFrom('library')}
      />

      {/* Menu-initiated arrow visuals — live arrow from the source card
          to the cursor. Green for "Attach to card...", red for "Draw
          arrow...". Ports Cockatrice's ArrowAttachItem / ArrowDragItem
          mouse-grabbed visuals (arrow_item.cpp:177+, 288+). Uses the
          exact same curved-leaf path helper the right-click-drag arrow
          uses so the shape is 1:1. */}
      {(attachPending || drawArrowPending) && pendingArrowPointer &&
        (() => {
          const color = attachPending ? ArrowColor.GREEN : ArrowColor.RED;
          // Attach fires from every selected source (primary + extras
          // snapshotted at start) so multi-attach shows one green arrow
          // per source card, all converging on the pointer. Draw-arrow
          // is always single-source.
          const sourceIds: readonly number[] = attachPending
            ? [attachPending.sourceCardId, ...attachExtraSourceIds]
            : [drawArrowPending!.sourceCardId];
          // Cockatrice's ArrowItem::paint uses alpha 150 while unlocked
          // and 200 when snapped to a target. We don't do target-snap
          // preview here (menu flows resolve on click), so always draw
          // at 200 to read as "committed direction".
          const fill = rgbaToCss({ ...color, a: 200 });
          // Look each source card up by its data attributes so we don't
          // have to plumb a ref out of the render loop.
          type Geom = NonNullable<ReturnType<typeof buildArrowGeometry>>;
          const geoms: { sourceId: number; geom: Geom }[] = [];
          for (const sourceId of sourceIds) {
            const cardIdSel = CSS.escape(String(sourceId));
            const ownerSel = CSS.escape(String(playerId));
            const zoneSel = CSS.escape(ZoneName.TABLE);
            const el = document.querySelector(
              `[data-card-id="${cardIdSel}"][data-card-owner="${ownerSel}"][data-card-zone="${zoneSel}"]`,
            ) as HTMLElement | null;
            if (!el) {
              continue;
            }
            const r = el.getBoundingClientRect();
            const sx = r.left + r.width / 2;
            const sy = r.top + r.height / 2;
            const geom = buildArrowGeometry(sx, sy, pendingArrowPointer.x, pendingArrowPointer.y);
            if (!geom) {
              continue;
            }
            geoms.push({ sourceId, geom });
          }
          if (geoms.length === 0) {
            return null;
          }
          return createPortal(
            <svg
              style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 200,
                overflow: 'visible',
              }}
              aria-hidden
            >
              {geoms.map(({ sourceId, geom }) => (
                <g
                  key={sourceId}
                  transform={`translate(${geom.originX} ${geom.originY}) rotate(${geom.angleDeg})`}
                >
                  <path
                    d={geom.d}
                    fill={fill}
                    stroke="black"
                    strokeWidth={1}
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </svg>,
            document.body,
          );
        })()}

      {/* View top/bottom N cards modal — from the "View top cards of
          library..." (and eventually "View bottom cards...") library
          context menu items. Submit dispatches Command_DumpZone with
          the requested count + direction, then opens the search dialog
          keyed to the revealed snapshot. */}
      {viewNCardsModal &&
        createPortal(
          <ViewNCardsModal
            isReversed={viewNCardsModal.isReversed}
            deckSize={viewNCardsModal.deckSize}
            initial={Math.min(
              3,
              Math.max(1, viewNCardsModal.deckSize),
            )}
            onCancel={() => setViewNCardsModal(null)}
            onConfirm={(value) => {
              onDumpTopCards?.(value, viewNCardsModal.isReversed);
              setTopCardsView({ isReversed: viewNCardsModal.isReversed });
              setViewNCardsModal(null);
            }}
          />,
          document.body,
        )}

      {/* "Put top cards on stack until…" — Cockatrice's aMoveTopCardsUntil.
          Submit kicks off the iterative loop; the useEffect above
          drives the reveal / match / decide cycle on each stackCards
          update. */}
      {moveTopUntilModalOpen &&
        createPortal(
          <MoveTopUntilModal
            deckSize={deckCount}
            onCancel={() => setMoveTopUntilModalOpen(false)}
            onConfirm={(args) => {
              setMoveTopUntilModalOpen(false);
              startMoveTopUntil(args);
            }}
          />,
          document.body,
        )}

      {/* "Reveal top cards to <player>" numeric prompt. Same modal as
          "View top cards" — same input math, same clamp — with a
          reveal-specific title. Submit fires Command_RevealCards
          (via onRevealTopCards); server sends face-up card list to
          the target (and originator), summary to spectators. Our
          IncomingRevealDialog picks up the receiver-side popup for
          anyone in the reveal audience. */}
      {revealTopCardsPrompt &&
        createPortal(
          <ViewNCardsModal
            isReversed={false}
            deckSize={revealTopCardsPrompt.deckSize}
            initial={Math.min(3, Math.max(1, revealTopCardsPrompt.deckSize))}
            titleOverride={`Reveal top cards of library to ${revealTopCardsPrompt.targetName}`}
            onCancel={() => setRevealTopCardsPrompt(null)}
            onConfirm={(value) => {
              onRevealTopCards?.(revealTopCardsPrompt.targetPlayerId, value);
              setRevealTopCardsPrompt(null);
            }}
          />,
          document.body,
        )}

      {/* Generic count prompt for the Top-of-library / Bottom-of-library
          multi-card submenu items (Move N to grave/exile ± FD, Draw
          bottom N, Shuffle top/bottom N). Reuses ViewNCardsModal — the
          input is a positive integer clamped to deck size, same as
          view/reveal-top-cards. Per-action title, submit label, and
          inline `onSubmit` come from the menu item that opened it. */}
      {countPrompt &&
        createPortal(
          <ViewNCardsModal
            isReversed={false}
            deckSize={countPrompt.deckSize}
            initial={Math.min(3, Math.max(1, countPrompt.deckSize))}
            titleOverride={countPrompt.title}
            submitLabel={countPrompt.submitLabel}
            onCancel={() => setCountPrompt(null)}
            onConfirm={(value) => {
              countPrompt.onSubmit(value);
              setCountPrompt(null);
            }}
          />,
          document.body,
        )}

      {/* Zone-reveal dialog for the "View top / bottom cards of
          library..." flow. Same component will host graveyard / exile
          reveal flows too — the caller supplies the title, shuffle
          option, and reorder handler; the dialog itself is
          zone-agnostic. Cockatrice's ZoneView shows revealed cards in
          server order (no sort/group), and lets you drag them to
          reorder — the parent forwards that as
          Command_MoveCard(source=zone, target=zone, x=toIndex). */}
      {topCardsView && (
        <ZoneRevealDialog
          isOpen
          title={`${topCardsView.isReversed ? 'Bottom' : 'Top'} ${revealedDeckCards?.length ?? 0} cards — ${name}`}
          cards={revealedDeckCards ?? []}
          // Position label per card: the actual 0-indexed deck position,
          // read straight off the reveal card's id (server writes the
          // real deck position — Cockatrice invariant, see
          // reindexRevealed / view_zone_logic.cpp). Bottom view: server
          // sends cards.size()-N..cards.size()-1 in that order, so
          // revealed[N-1] is the actual bottom. Ends → "Top" / "Bottom";
          // middle → the raw 0-indexed position.
          labels={(revealedDeckCards ?? []).map((c) => {
            const libraryPos = Number(c.id);
            if (!Number.isFinite(libraryPos)) {
              return '';
            }
            if (libraryPos <= 0) {
              return 'Top';
            }
            if (libraryPos >= deckCount - 1) {
              return 'Bottom';
            }
            return String(libraryPos);
          })}
          // Outbound drag — pointerdown on a card starts a normal
          // library-source drag, so it can be dropped on any zone in
          // the play area. Drops back on the dialog resolve to library
          // via `zoneRevealDialogRef` in detectDropTarget.
          onCardPointerDown={
            isSelf
              ? (e, c) => revealDragSource(e, [c])
              : undefined
          }
          dropRef={revealDialogZoneRef}
          draggingCardIds={draggingIdsFrom('library')}
          onClose={() => {
            setTopCardsView(null);
            onClearRevealedDeck?.();
          }}
        />
      )}

      {/* View graveyard / exile / hand — reuses LibrarySearchDialog so
          the pile view / group-by / sort-by controls match the
          "View library" flow. Graveyard and exile are public zones
          whose full card list Redux already carries; hand is private
          but only opened for the local player (`isSelf`-gated at the
          menu), whose byId/order is populated too. No wire fires on
          open (unlike the library flow which needs Command_DumpZone
          first) and nothing needs clearing on close.
          `showShuffleOnClose={false}` hides the toggle — shuffling
          a pile that isn't the library makes no sense.
          `enrichedDeckCards` is passed so the group/sort dropdowns
          have Scryfall-backfilled type / cmc / color info to work
          with (graveyard / hand cards typically originated from the
          deck). Drag-out uses the pile's source-zone so the move
          fires the correct startZone; drag-in lands on the dialog's
          seat drop zone, which routes to
          Command_MoveCard(target={GRAVE|EXILE|HAND}). */}
      {pileView && (
        <LibrarySearchDialog
          isOpen
          title={`${
            pileView.zone === 'graveyard'
              ? 'Graveyard'
              : pileView.zone === 'exile'
                ? 'Exile'
                : 'Hand'
          } — ${name}`}
          showShuffleOnClose={false}
          library={
            pileView.zone === 'graveyard'
              ? graveDisplayList
              : pileView.zone === 'exile'
                ? exileDisplayList
                : handDisplayList
          }
          deckCards={enrichedDeckCards}
          playerName={name}
          onCardPointerDown={
            isSelf
              ? (e, c) => pileViewDragSource(e, [c])
              : undefined
          }
          // Per-card right-click menu. Anchors at the pointer so it
          // opens where the user clicked, and carries the source
          // zone (GRAVE / EXILE) so the Draw arrow flow can set the
          // wire's `startZone` correctly. The hand-pile view skips
          // this menu — hand cards already have their own drag-based
          // interactions, and the Draw / Clone actions offered by
          // pileCardMenu don't make sense from hand.
          onCardContextMenu={
            pileView.zone === 'hand'
              ? undefined
              : (e, c) => {
                openSeatCardMenu({
                  kind: 'pile',
                  playerId: menuOwnerId,
                  zone:
                    pileView.zone === 'graveyard'
                      ? ZoneName.GRAVE
                      : ZoneName.EXILE,
                  cardId: c.id,
                  cardName: c.name,
                  x: e.clientX,
                  y: e.clientY,
                });
              }
          }
          // dropRef lets detectDropTarget hit-test the modal so a
          // drag-and-release inside the dialog is a no-op (graveyard /
          // exile resolve to the source pile, hand to no target)
          // instead of falling through to the battlefield behind.
          // Without this the modal was invisible to drop detection.
          dropRef={pileViewDialogZoneRef}
          draggingCardIds={draggingIdsFrom(pileView.zone)}
          onClose={() => setPileView(null)}
        />
      )}

      {/* Sideboard view — Cockatrice's actViewSideboard opens the
          same zone-view dialog "View library" uses (player_actions.cpp:232-234).
          We reuse LibrarySearchDialog against the local player's
          SIDEBOARD zone. Owner-only (gated on isSelf) — sideboard
          contents are private, and only the owner has byId/order
          populated. No wire fires on open: the sideboard zone is
          already populated in Redux from the initial game state
          broadcast. Drag out: cards drag by their server position like
          the library dialogs. Drop in: the dialog's seat drop zone
          resolves to `{ zone: "sideboard" }`, and the move fires
          Command_MoveCard(target=SIDEBOARD, x=-1) to append. */}
      {isSelf && viewSideboardOpen && (
        <LibrarySearchDialog
          isOpen
          title={`Sideboard — ${name}`}
          showShuffleOnClose={false}
          library={sideboardCards ?? []}
          deckCards={enrichedDeckCards}
          playerName={name}
          onCardPointerDown={(e, c) => sideboardDragSource(e, [c])}
          dropRef={sideboardDialogZoneRef}
          draggingCardIds={draggingIdsFrom('sideboard')}
          onClose={() => {
            closeViewSideboard();
            // Clear the revealed snapshot so the next open re-dumps
            // fresh (mirrors Cockatrice's zoneViewCleared broadcast
            // on ZoneViewWidget close).
            onClearRevealedSideboard?.();
          }}
        />
      )}

      {/* Draw cards modal — from the "Draw cards..." library context
          menu item. Submit calls `draw(N)` which fires the same wire
          + local flow used by Ctrl+D. */}
      {drawCardsModal &&
        createPortal(
          <DrawCardsModal
            deckSize={drawCardsModal.deckSize}
            initial={Math.min(1, Math.max(1, drawCardsModal.deckSize))}
            onCancel={() => setDrawCardsModal(null)}
            onConfirm={(value) => {
              draw(value);
              setDrawCardsModal(null);
            }}
          />,
          document.body,
        )}

      {/* "Create token..." modal — from the battlefield context menu's
          Create-token item. Submit fires Command_CreateToken via
          onCreateToken (GameBoardCell computes y from a Dexie tablerow
          lookup) and snapshots the args into lastToken so a subsequent
          "Create another token" can re-fire without reprompting. Pre-
          seeds fields from lastToken so the modal is a good "edit last
          token" flow too. */}
      {createTokenModalOpen &&
        createPortal(
          <CreateTokenModal
            initial={lastToken}
            onCancel={() => setCreateTokenModalOpen(false)}
            onConfirm={(payload) => {
              setLastToken(payload);
              setCreateTokenModalOpen(false);
              onCreateToken?.(payload);
            }}
          />,
          document.body,
        )}

      {/* Move X cards from top modal — from the "X cards from the top
          of library..." submenu item. Submit sends Command_MoveCard
          with x=N to place the card at position N in the deck. */}
      {moveXModal &&
        createPortal(
          <MoveXCardsFromTopModal
            cardName={moveXModal.cardName}
            deckSize={moveXModal.deckSize}
            initial={Math.min(3, Math.max(0, moveXModal.deckSize))}
            onCancel={() => setMoveXModal(null)}
            onConfirm={(value) => {
              if (onMoveCards) {
                onMoveCards(ZoneName.TABLE, [moveXModal.cardId], { zone: ZoneName.DECK, index: value, reversed: false });
              }
              setMoveXModal(null);
            }}
          />,
          document.body,
        )}

      {/* Card context menu — right-click a battlefield card to open.
          All actions apply to a single card via its real numeric id;
          the menu no-ops for optimistic mock cards without one. */}
      {cardContextMenu &&
        (() => {
          const cardIdNum = Number(cardContextMenu.cardId);
          const card = battlefieldDisplayList.find(
            (bc) => bc.id === cardContextMenu.cardId,
          );
          const numeric = Number.isFinite(cardIdNum) && card != null;
          const close = closeSeatCardMenu;
          // Opponent card menu — ports Cockatrice's
          // card_menu.cpp:183-194 `!canModifyCard` branch on the TABLE
          // zone. Minimal item set: things a viewer can do to an
          // opponent's battlefield card without modifying opponent
          // state (arrows, clone via own-side token, life bookkeeping,
          // selection). Excludes tap / flip / P/T / annotation /
          // counters / move / attach — all owner-only.
          if (!isSelf) {
            // Selection scope on an opponent battlefield: the same
            // rule as own-side — if the right-clicked card is part of
            // THIS battlefield's local selection, actions treat the
            // whole selection as targets; otherwise just this card.
            // Local selection state is scoped per PlayerBox, so an
            // opponent PlayerBox has its OWN selection here (used by
            // the viewer to visually group opponent cards).
            const targets: BattlefieldCard[] = card
              && selection?.zone === 'battlefield'
              && selection.ids.has(card.id)
              ? battlefieldDisplayList.filter((bc) => selection.ids.has(bc.id))
              : card
                ? [card]
                : [];
            const opponentItems: CardMenuItem[] = [
              {
                // Enters pending-arrow mode from the opponent's card.
                // Wire is symmetric: arrow is created by the LOCAL
                // player and points at any card or player. Fires the
                // same setDrawArrowPending flow as the own-side menu.
                label: 'Draw arrow...',
                shortcut: shortcutHints['game.drawArrow'],
                onClick: () => {
                  if (numeric && card) {
                    setDrawArrowPending({
                      sourceCardId: cardIdNum,
                      sourceCardName: card.name,
                      sourceZone: ZoneName.TABLE,
                    });
                  }
                  close();
                },
              },
              {
                // Creates a token on the LOCAL player's battlefield
                // that copies the opponent's card. Same wire as own-
                // side clone: Command_CreateToken is sent by the
                // local client so the server assigns local ownership.
                label: 'Clone',
                shortcut: shortcutHints['game.cloneCard'],
                onClick: () => {
                  if (onCloneCard && targets.length > 0) {
                    for (const bc of targets) {
                      if (!Number.isFinite(Number(bc.id))) {
                        continue;
                      }
                      onCloneCard({
                        name: bc.name,
                        providerId: bc.scryfallId,
                        color: bc.color ?? '',
                        pt: bc.pt ?? '',
                        annotation: bc.annotation ?? '',
                        y: bc.slot.row,
                      });
                    }
                  }
                  close();
                },
              },
              { divider: true },
              {
                // Ports actReduceLifeByPower (player_actions.cpp:1432-
                // 1455). Sums power over the selection (or just this
                // card) and fires one Command_IncCounter with a
                // negative delta. Cockatrice sends this against the
                // card owner's life counter id; Servatrice creates
                // the life counter with the same numeric id for every
                // seat, so calling `onDelta` on THIS PlayerBox's
                // lifeControl (which carries the opponent's life
                // counter id) routes through the local client and
                // modifies the LOCAL player's life counter — matching
                // desktop's "opponent creature just hit me, subtract
                // its power from my life" outcome. Same coincidence
                // Cockatrice itself relies on.
                label: 'Reduce life by power',
                shortcut: shortcutHints['game.reduceLifeByPower'],
                onClick: () => {
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
                    const power = typeof first === 'number'
                      ? first
                      : parseInt(first, 10);
                    if (Number.isFinite(power)) {
                      total += Math.max(power, 0);
                    }
                  }
                  if (total > 0) {
                    lifeControl?.onDelta(-total);
                  }
                  close();
                },
              },
              { divider: true },
              {
                // Mirror the own-side handlers. Opponent PlayerBox
                // owns its own local marquee-selection state; setting
                // it here highlights the opponent's cards visually so
                // a subsequent Draw arrow / Clone can act on the group.
                label: 'Select All',
                shortcut: shortcutHints['game.selectAllBattlefield'],
                onClick: () => {
                  const ids = new Set(
                    battlefieldDisplayList.map((bc) => bc.id),
                  );
                  if (ids.size > 0) {
                    setSelection({ zone: 'battlefield', ids });
                  }
                  close();
                },
              },
              {
                label: 'Select Row',
                shortcut: shortcutHints['game.selectRowBattlefield'],
                onClick: () => {
                  if (!card) {
                    close();
                    return;
                  }
                  const ids = new Set(
                    battlefieldDisplayList
                      .filter((bc) => bc.slot.row === card.slot.row)
                      .map((bc) => bc.id),
                  );
                  if (ids.size > 0) {
                    setSelection({ zone: 'battlefield', ids });
                  }
                  close();
                },
              },
              { divider: true },
              // Cockatrice reads the card's `related` field from the
              // card DB and pops up a small dialog. We don't have that
              // wire yet; leave as a disabled placeholder so the menu
              // shape matches desktop 1:1 (card_menu.cpp:194).
              { label: 'View related cards' },
              // "Token: …" items — same shape as the own-card menu
              // below. Ports Cockatrice's addRelatedCardActions
              // (card_menu.cpp:407-479). Command_CreateToken fires as
              // the LOCAL player so the token lands on OUR
              // battlefield — matches desktop (right-clicking an
              // opponent's Avenger of Zendikar creates the Plant on
              // your side). See buildRelatedTokenItems for the label
              // format + count/persistent semantics. The Transform
              // item is included but it fires against the opponent's
              // card id — server processes as "replace opponent's
              // DFC with the new face" the same as own-side.
              ...(() => {
                if (!card) {
                  return [];
                }
                const items = [
                  ...buildRelatedTokenItems(
                    cardMetaByName.get(card.name)?.related ?? [],
                    tokenMetaByName,
                    onCreateToken,
                  ),
                  ...buildTransformItems(
                    cardMetaByName.get(card.name),
                    Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                    card.name,
                    onCreateToken,
                  ),
                ];
                return items.length > 0
                  ? [{ divider: true } as CardMenuItem, ...items]
                  : [];
              })(),
            ];
            return (
              <CardMenuPopup
                items={opponentItems}
                anchor={{ x: cardContextMenu.x, y: cardContextMenu.y }}
                disabled={!numeric}
                onClose={closeSeatCardMenu}
              />
            );
          }
          // Multi-card target set. Cockatrice's cardMenuAction pattern
          // (player_actions.cpp:1761-1808): if the right-clicked card
          // is part of the current marquee selection, actions apply to
          // every selected card; otherwise, they apply only to this
          // card. `targetCards` is filtered to numeric server ids —
          // optimistic mock-id cards silently drop out of the batch.
          const targetCards: BattlefieldCard[] =
            card &&
            selection?.zone === 'battlefield' &&
            selection.ids.has(card.id)
              ? battlefieldDisplayList.filter((bc) =>
                selection.ids.has(bc.id),
              )
              : card
                ? [card]
                : [];
          const targetIds: number[] = targetCards
            .map((c) => Number(c.id))
            .filter((n) => Number.isFinite(n));
          const dispatchMove = (to: SeatMoveDestination) => {
            if (targetIds.length === 0 || !onMoveCards) {
              return;
            }
            // Single Command_MoveCard with cards_to_move populated for
            // every selected card — matches Cockatrice's batched
            // move (cardsToMove is a repeated field).
            onMoveCards(ZoneName.TABLE, targetIds, { reversed: false, ...to });
          };
          // Effective current PT — prefer server's tagged PT, fall back
          // to the Scryfall base so Inc/Dec/Flow have a starting value
          // even before the server has committed any AttrPT change.
          const currentPT =
            card?.pt || (card ? cardMetaByName.get(card.name)?.pt ?? '' : '');
          // Per-card PT delta batch: each card computes its own new PT
          // from its own current server PT (not the clicked card's PT).
          // Cards with no starting PT (non-creatures with no printed
          // stats) are treated as `0/0` so a `+1/+1` gives them `1/1`,
          // `+1/+0` gives `1/0`, `+0/+1` gives `0/1`, and the negative
          // variants mirror. This matches how MTG's +1/+1 counters,
          // Giant Growth, etc. would apply to a card that acquires
          // creature status mid-game (see e.g. Song of the Dryads).
          // Single onSetPT batch keeps the wire atomic.
          const dispatchPTDelta = (dp: number, dt: number) => {
            if (targetCards.length === 0 || !onSetPT) {
              return;
            }
            const entries: { cardId: number; pt: string }[] = [];
            for (const bc of targetCards) {
              const bcId = Number(bc.id);
              if (!Number.isFinite(bcId)) {
                continue;
              }
              const bcCurrent =
                bc.pt || (cardMetaByName.get(bc.name)?.pt ?? '');
              // Empty base → use "0/0" so the resulting P/T carries
              // both components (applyPTDelta's empty-input branch
              // would otherwise return e.g. "1" for +1/+0 by dropping
              // the toughness suffix).
              const base = bcCurrent || '0/0';
              entries.push({
                cardId: bcId,
                pt: applyPTDelta(base, dp, dt),
              });
            }
            if (entries.length > 0) {
              onSetPT(entries);
            }
          };
          // "Token: …" items from the card's related list PLUS the
          // "Token: Transform into …" item for DFC-family cards.
          // Both appear in Cockatrice's addRelatedCardActions block,
          // rendered as a flat list under "Card counters".
          const tokenItems: CardMenuItem[] = card
            ? [
              ...buildRelatedTokenItems(
                cardMetaByName.get(card.name)?.related ?? [],
                tokenMetaByName,
                onCreateToken,
              ),
              ...buildTransformItems(
                cardMetaByName.get(card.name),
                Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                card.name,
                onCreateToken,
              ),
            ]
            : [];
          const menu = buildCardContextMenu({
            shortcutHints,
            faceDown: card?.faceDown ?? false,
            doesntUntap: card?.doesntUntap ?? false,
            onTapUntap: () => {
              // Toggle all selected cards to the OPPOSITE of the
              // clicked card's tapped state (matches Cockatrice: the
              // clicked card drives the target value so a mixed
              // selection all lands in the same state).
              if (targetIds.length > 0 && card && onSetCardTapped) {
                onSetCardTapped(targetIds, !card.tapped);
              }
              close();
            },
            onFlip: () => {
              // Batch each selected card's flip individually — wire
              // takes a single cardId. Uses the clicked card's
              // current faceDown to drive the target value so a
              // mixed selection unifies.
              if (targetIds.length > 0 && onFlipCard) {
                const target = !card?.faceDown;
                for (const id of targetIds) {
                  onFlipCard(id, target);
                }
              }
              close();
            },
            onPeek: () => {
              // Only peek face-down cards in the selection — face-up
              // cards are already known to us, so a peek is noise.
              if (!onPeekCards || targetCards.length === 0) {
                close();
                return;
              }
              const ids = targetCards
                .filter((bc) => bc.faceDown)
                .map((bc) => Number(bc.id))
                .filter((n) => Number.isFinite(n));
              if (ids.length > 0) {
                onPeekCards(ids);
              }
              close();
            },
            onSkipUntapping: () => {
              if (targetIds.length > 0 && onSetCardDoesntUntap) {
                const target = !card?.doesntUntap;
                for (const id of targetIds) {
                  onSetCardDoesntUntap(id, target);
                }
              }
              close();
            },
            onClone: () => {
              // Fire one Command_CreateToken per selected card,
              // preserving each card's own name / provider / color /
              // pt / annotation / row — matches Cockatrice's cmClone
              // which iterates the selection. Skips optimistic-mock
              // cards (no server card to clone).
              if (onCloneCard && targetCards.length > 0) {
                for (const bc of targetCards) {
                  if (!Number.isFinite(Number(bc.id))) {
                    continue;
                  }
                  onCloneCard({
                    name: bc.name,
                    providerId: bc.scryfallId,
                    color: bc.color ?? '',
                    pt: bc.pt ?? '',
                    annotation: bc.annotation ?? '',
                    y: bc.slot.row,
                  });
                }
              }
              close();
            },
            onSetAnnotation: () => {
              // Modal takes a single input, but the confirmed text is
              // applied to EVERY selected card. Snapshot targetIds
              // now so a mid-modal selection change doesn't shift the
              // target set. Pre-fill from the clicked card.
              if (targetIds.length > 0 && card) {
                openAnnotationPrompt({
                  targetIds,
                  cardName: card.name,
                  current: card.annotation ?? '',
                });
              }
              close();
            },
            onMoveToTop: () => {
              dispatchMove({ zone: ZoneName.DECK });
              close();
            },
            onMoveToBottom: () => {
              dispatchMove({ zone: ZoneName.DECK, reversed: true });
              close();
            },
            onMoveToXCardsFromTop: () => {
              if (numeric && card) {
                // Prefer the server-authoritative deck count from
                // Redux, fall back to the local library length. Matches
                // Cockatrice's `player->getDeckZone()->getCards().size()`.
                const deckSize = zoneCounts?.deck ?? 0;
                setMoveXModal({
                  cardId: cardIdNum,
                  cardName: card.name,
                  deckSize,
                });
              }
              close();
            },
            onMoveToTable: () => {
              dispatchMove({ zone: ZoneName.TABLE });
              close();
            },
            onMoveToHand: () => {
              dispatchMove({ zone: ZoneName.HAND });
              close();
            },
            onMoveToGrave: () => {
              dispatchMove({ zone: ZoneName.GRAVE });
              close();
            },
            onMoveToExile: () => {
              dispatchMove({ zone: ZoneName.EXILE });
              close();
            },
            onIncP: () => {
              dispatchPTDelta(1, 0);
              close();
            },
            onDecP: () => {
              dispatchPTDelta(-1, 0);
              close();
            },
            onFlowP: () => {
              dispatchPTDelta(1, -1);
              close();
            },
            onIncT: () => {
              dispatchPTDelta(0, 1);
              close();
            },
            onDecT: () => {
              dispatchPTDelta(0, -1);
              close();
            },
            onFlowT: () => {
              dispatchPTDelta(-1, 1);
              close();
            },
            onIncPT: () => {
              dispatchPTDelta(1, 1);
              close();
            },
            onDecPT: () => {
              dispatchPTDelta(-1, -1);
              close();
            },
            onSetPT: () => {
              // Modal takes a single input string — applied to every
              // selected card on confirm (each card uses its own
              // current PT as the applyPTSet base). Snapshot the
              // target ids at open time so a mid-modal selection
              // change doesn't shift the target set.
              if (targetIds.length > 0 && card) {
                openPTPrompt({
                  targetIds,
                  cardName: card.name,
                  current: currentPT,
                });
              }
              close();
            },
            onResetPT: () => {
              // Per-card reset: face-down cards reset to empty PT,
              // face-up cards reset to their own printed base PT
              // (each card has its own base from Scryfall). Skip cards
              // already at their reset value.
              if (targetCards.length === 0 || !onSetPT) {
                close();
                return;
              }
              const entries: { cardId: number; pt: string }[] = [];
              for (const bc of targetCards) {
                const bcId = Number(bc.id);
                if (!Number.isFinite(bcId)) {
                  continue;
                }
                const base = bc.faceDown
                  ? ''
                  : cardMetaByName.get(bc.name)?.pt ?? '';
                if (base !== (bc.pt ?? '')) {
                  entries.push({ cardId: bcId, pt: base });
                }
              }
              if (entries.length > 0) {
                onSetPT(entries);
              }
              close();
            },
            onAttachToCard: () => {
              if (numeric && card) {
                // Right-clicked card is the visual anchor (arrow origin).
                // If it's part of a multi-selection, the rest of the
                // selection rides along as extras — matches Cockatrice's
                // attach-many behavior. `targetCards` is already the
                // selection when the right-clicked card is part of it,
                // else just this card, so we filter it out to leave the
                // extras.
                const extras = targetCards
                  .filter((bc) => Number(bc.id) !== cardIdNum)
                  .map((bc) => Number(bc.id))
                  .filter((n) => Number.isFinite(n));
                setAttachPending({
                  sourceCardId: cardIdNum,
                  sourceCardName: card.name,
                });
                setAttachExtraSourceIds(extras);
              }
              close();
            },
            onDrawArrow: () => {
              if (numeric && card) {
                setDrawArrowPending({
                  sourceCardId: cardIdNum,
                  sourceCardName: card.name,
                  // Battlefield-card menu → source zone is always TABLE.
                  // The grave / exile pile-view menus fire their own
                  // setDrawArrowPending with the appropriate zone name.
                  sourceZone: ZoneName.TABLE,
                });
              }
              close();
            },
            onReduceLifeByPower: () => {
              // Cockatrice iterates the marquee selection so several
              // creatures' powers can sum. Mirror that: if this card is
              // part of the current battlefield selection, use every
              // selected card; otherwise just this card.
              const targetIds =
                card && selection?.zone === 'battlefield' && selection.ids.has(card.id)
                  ? selection.ids
                  : card
                    ? new Set<string>([card.id])
                    : new Set<string>();
              // Sum powers from ONLY the server-set PT (`card.pt`).
              // Matches Cockatrice's `card->getPT()` — no fallback to
              // Scryfall printed PT. A creature the server hasn't
              // tagged with a PT contributes 0 (its `pt` is empty and
              // `parsePT` returns []). First token → power; negative
              // clamped to 0 via `Math.max(power, 0)` matching Cockatrice's
              // `qMax(parsed.first().toInt(), 0)`.
              let total = 0;
              for (const id of targetIds) {
                const bc = battlefieldDisplayList.find((x) => x.id === id);
                if (!bc || !bc.pt) {
                  continue;
                }
                const tokens = parsePT(bc.pt);
                if (tokens.length === 0) {
                  continue;
                }
                const first = tokens[0];
                const power =
                  typeof first === 'number' ? first : parseInt(first, 10);
                if (Number.isFinite(power)) {
                  total += Math.max(power, 0);
                }
              }
              if (total > 0) {
                lifeControl?.onDelta(-total);
              }
              close();
            },
            onSelectAll: () => {
              // Every card on this battlefield. Cross-battlefield
              // selection isn't a Cockatrice thing — actSelectAll
              // scopes to `card->getZone()` which is this player's
              // TABLE zone.
              const ids = new Set(battlefieldDisplayList.map((bc) => bc.id));
              if (ids.size > 0) {
                setSelection({ zone: 'battlefield', ids });
              }
              close();
            },
            onSelectRow: () => {
              // Every battlefield card sharing this card's `slot.row`.
              // Cockatrice's `actSelectRow` uses a 50-scene-pixel
              // vertical threshold since positions can drift within a
              // row; our layout snaps cards to discrete rows via
              // `slot.row`, so exact match is equivalent.
              if (!card) {
                close();
                return;
              }
              const ids = new Set(
                battlefieldDisplayList
                  .filter((bc) => bc.slot.row === card.slot.row)
                  .map((bc) => bc.id),
              );
              if (ids.size > 0) {
                setSelection({ zone: 'battlefield', ids });
              }
              close();
            },
            isAttached:
              card?.attachTargetCardId != null && card.attachTargetCardId >= 0,
            onUnattach: () => {
              // Fire per-card unattach for every selected card. Server
              // treats each unattach independently (no batch wire), so
              // we loop.
              if (onUnattachCard) {
                for (const id of targetIds) {
                  onUnattachCard(id);
                }
              }
              close();
            },
            onAddCardCounter: (counterId: number) => {
              // Batch: each selected card computes its OWN cur+1
              // (independent of the clicked card's value) so a mixed
              // selection doesn't get truncated. Uses the atomic
              // bulk-set helper so all cards land in one wire.
              if (onBulkSetCardCounters && targetCards.length > 0) {
                const entries: {
                  cardId: number;
                  counterId: number;
                  value: number;
                }[] = [];
                for (const bc of targetCards) {
                  const bcId = Number(bc.id);
                  if (!Number.isFinite(bcId)) {
                    continue;
                  }
                  const cur =
                    bc.counters?.find((cc) => cc.id === counterId)?.value ??
                    0;
                  if (cur >= MAX_COUNTER_VALUE) {
                    continue;
                  }
                  entries.push({
                    cardId: bcId,
                    counterId,
                    value: cur + 1,
                  });
                }
                if (entries.length > 0) {
                  onBulkSetCardCounters(entries);
                }
              }
              close();
            },
            onSetCardCounter: (counterId: number) => {
              // Modal takes a single input — applied to every selected
              // card on confirm. Pre-fills with the clicked card's
              // current value. Snapshot targetIds at open time.
              if (targetIds.length > 0 && card) {
                const cur =
                  card.counters?.find((cc) => cc.id === counterId)?.value ?? 0;
                openCardCounterPrompt({ targetIds, cardName: card.name, counterId, currentValue: cur });
              }
              close();
            },
            tokenItems,
          });
          return (
            <CardMenuPopup
              items={menu}
              anchor={{ x: cardContextMenu.x, y: cardContextMenu.y }}
              disabled={!numeric}
              onClose={closeSeatCardMenu}
            />
          );
        })()}

      {/* Pile-view card context menu — right-click a card inside the
          graveyard / exile pile-view modal. View-only shape: Draw
          arrow / Clone / Select All / Select Column, matching
          Cockatrice's card-in-ZoneView menu. Uses the same
          CardMenuPopup renderer as the battlefield menu — only
          the item set differs. */}
      {pileCardMenu &&
        (() => {
          const cardIdNum = Number(pileCardMenu.cardId);
          const numeric = Number.isFinite(cardIdNum);
          const close = closeSeatCardMenu;
          const items: CardMenuItem[] = [
            {
              // "Draw arrow..." — enters pending-arrow mode with the
              // source pointing at THIS grave/exile card. The window-
              // level resolver above handles the target pick; the wire
              // fires with startZone = the pile's zone (GRAVE / EXILE)
              // so both clients render the arrow off the pile. Only
              // battlefield cards / player anchors are valid targets
              // — Cockatrice never lets you target grave/exile cards.
              label: 'Draw arrow...',
              shortcut: shortcutHints['game.drawArrow'],
              onClick: () => {
                if (numeric) {
                  setDrawArrowPending({
                    sourceCardId: cardIdNum,
                    sourceCardName: pileCardMenu.cardName,
                    sourceZone: pileCardMenu.zone,
                  });
                }
                close();
              },
            },
            {
              // "Clone" — creates a token copy on the LOCAL player's
              // battlefield (Command_CreateToken is sent by the local
              // client so the server assigns ownership accordingly).
              // Grave cards don't carry PT / color / annotation state
              // (they were reset when they left the battlefield per
              // resetCardState), so pass empties. Only wired when we
              // have a real numeric card id (mock-id no-op).
              label: 'Clone',
              shortcut: shortcutHints['game.cloneCard'],
              onClick: () => {
                if (numeric) {
                  const graveCard =
                    pileView?.zone === 'graveyard'
                      ? graveDisplayList.find(
                        (gc) => gc.id === pileCardMenu.cardId,
                      )
                      : exileDisplayList.find(
                        (gc) => gc.id === pileCardMenu.cardId,
                      );
                  if (graveCard) {
                    onCloneCard?.({
                      name: graveCard.name,
                      providerId: graveCard.scryfallId,
                      color: '',
                      pt: '',
                      annotation: '',
                      y: 0,
                    });
                  }
                }
                close();
              },
            },
            {
              // Cockatrice's actSelectAll / actSelectColumn set the
              // marquee selection inside the ZoneView so a subsequent
              // Draw arrow / Clone applies to every selected card.
              // The LibrarySearchDialog owns its own `selectedIds`
              // state internally; wiring these items would need to
              // expose an imperative setter from the dialog. Deferred
              // until a caller actually needs multi-select in this
              // flow — the menu shape stays 1:1 with Cockatrice.
              label: 'Select All',
              shortcut: shortcutHints['game.selectAllBattlefield'],
            },
            {
              label: 'Select Column',
              shortcut: shortcutHints['game.selectColumnBattlefield'],
            },
          ];
          return (
            <CardMenuPopup
              items={items}
              anchor={{ x: pileCardMenu.x, y: pileCardMenu.y }}
              disabled={!numeric}
              onClose={closeSeatCardMenu}
            />
          );
        })()}

      {/* Stack-card context menu — ports Cockatrice's
          `CardMenu::createStackMenu` (card_menu.cpp:201-227). Own-stack
          gets the full item set (Play / Play Face Down / Clone /
          Move to / Attach / Draw arrow / Select All); opponent-stack
          gets the trimmed view-only branch (Draw arrow / Clone / Select
          All). Wire cannot fire moves for opponent-owned stack cards
          (server rejects), so those items are omitted rather than shown
          disabled. */}
      {stackCardMenu &&
        (() => {
          const cardIdNum = Number(stackCardMenu.cardId);
          const card = stackDisplayList.find((sc) => sc.id === stackCardMenu.cardId);
          const numeric = Number.isFinite(cardIdNum) && card != null;
          const close = closeSeatCardMenu;
          // Selection scope: same rule as the battlefield menu — the
          // right-clicked card acts on the whole selection when part
          // of a ≥2 selection on THIS box's stack, else just itself.
          const targets = card
            && selection?.zone === 'stack'
            && selection.ids.has(card.id)
            ? stackDisplayList.filter((sc) => selection.ids.has(sc.id))
            : card
              ? [card]
              : [];
          const targetIds = targets
            .map((sc) => Number(sc.id))
            .filter((n) => Number.isFinite(n));
          if (!isSelf) {
            // Opponent stack — Draw arrow / Clone / Select All only.
            const opponentItems: CardMenuItem[] = [
              {
                label: 'Draw arrow...',
                shortcut: shortcutHints['game.drawArrow'],
                onClick: () => {
                  if (numeric && card) {
                    setDrawArrowPending({
                      sourceCardId: cardIdNum,
                      sourceCardName: card.name,
                      sourceZone: ZoneName.STACK,
                    });
                  }
                  close();
                },
              },
              { divider: true },
              {
                label: 'Clone',
                shortcut: shortcutHints['game.cloneCard'],
                onClick: () => {
                  if (onCloneCard && targets.length > 0) {
                    for (const sc of targets) {
                      if (!Number.isFinite(Number(sc.id))) {
                        continue;
                      }
                      onCloneCard({
                        name: sc.name,
                        providerId: sc.scryfallId,
                        color: '',
                        pt: '',
                        annotation: sc.annotation ?? '',
                        y: 0,
                      });
                    }
                  }
                  close();
                },
              },
              { divider: true },
              {
                label: 'Select All',
                shortcut: shortcutHints['game.selectAllBattlefield'],
                onClick: () => {
                  const ids = new Set(stackDisplayList.map((sc) => sc.id));
                  if (ids.size > 0) {
                    setSelection({ zone: 'stack', ids });
                  }
                  close();
                },
              },
              // Related "Token: …" items — same as the battlefield
              // menu. Fires as the LOCAL player so the token lands on
              // OUR side even when right-clicking an opponent's stack
              // card, matching Cockatrice's cross-player Clone rule.
              ...(() => {
                if (!card) {
                  return [];
                }
                const tokens = [
                  ...buildRelatedTokenItems(
                    cardMetaByName.get(card.name)?.related ?? [],
                    tokenMetaByName,
                    onCreateToken,
                  ),
                  ...buildTransformItems(
                    cardMetaByName.get(card.name),
                    Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                    card.name,
                    onCreateToken,
                  ),
                ];
                return tokens.length > 0
                  ? [{ divider: true } as CardMenuItem, ...tokens]
                  : [];
              })(),
            ];
            return (
              <CardMenuPopup
                items={opponentItems}
                anchor={{ x: stackCardMenu.x, y: stackCardMenu.y }}
                disabled={!numeric}
                onClose={closeSeatCardMenu}
              />
            );
          }
          // Own stack — full menu.
          const moveFromStack = (to: SeatMoveDestination) => {
            if (!onMoveCards || targetIds.length === 0) {
              return;
            }
            onMoveCards(ZoneName.STACK, targetIds, { reversed: false, ...to });
          };
          const items: CardMenuItem[] = [
            {
              label: 'Play',
              onClick: () => {
                moveFromStack({ zone: ZoneName.TABLE, index: 'end' });
                close();
              },
            },
            {
              label: 'Play Face Down',
              onClick: () => {
                if (!onMoveCards || targetIds.length === 0) {
                  close();
                  return;
                }
                onMoveCards(
                  ZoneName.STACK,
                  targetIds.map((id) => ({ id, faceDown: true as const })),
                  { zone: ZoneName.TABLE, index: 'end' },
                );
                close();
              },
            },
            { divider: true },
            {
              label: 'Clone',
              shortcut: shortcutHints['game.cloneCard'],
              onClick: () => {
                if (onCloneCard && targets.length > 0) {
                  for (const sc of targets) {
                    if (!Number.isFinite(Number(sc.id))) {
                      continue;
                    }
                    onCloneCard({
                      name: sc.name,
                      providerId: sc.scryfallId,
                      color: '',
                      pt: '',
                      annotation: sc.annotation ?? '',
                      y: 0,
                    });
                  }
                }
                close();
              },
            },
            {
              label: 'Move to',
              submenu: [
                {
                  label: 'Hand',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.HAND, index: 'end' });
                    close();
                  },
                },
                {
                  label: 'Battlefield',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.TABLE, index: 'end' });
                    close();
                  },
                },
                {
                  label: 'Graveyard',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.GRAVE });
                    close();
                  },
                },
                {
                  label: 'Exile',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.EXILE });
                    close();
                  },
                },
                { divider: true },
                {
                  label: 'Top of Library',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.DECK });
                    close();
                  },
                },
                {
                  label: 'Bottom of Library',
                  onClick: () => {
                    moveFromStack({ zone: ZoneName.DECK, index: 'end' });
                    close();
                  },
                },
              ],
            },
            { divider: true },
            {
              label: 'Attach to card...',
              shortcut: shortcutHints['game.attachCard'],
              onClick: () => {
                if (numeric && card) {
                  const extras = targets
                    .filter((sc) => Number(sc.id) !== cardIdNum)
                    .map((sc) => Number(sc.id))
                    .filter((n) => Number.isFinite(n));
                  setAttachPending({
                    sourceCardId: cardIdNum,
                    sourceCardName: card.name,
                  });
                  setAttachExtraSourceIds(extras);
                }
                close();
              },
            },
            {
              label: 'Draw arrow...',
              shortcut: shortcutHints['game.drawArrow'],
              onClick: () => {
                if (numeric && card) {
                  setDrawArrowPending({
                    sourceCardId: cardIdNum,
                    sourceCardName: card.name,
                    sourceZone: ZoneName.STACK,
                  });
                }
                close();
              },
            },
            { divider: true },
            {
              label: 'Select All',
              shortcut: shortcutHints['game.selectAllBattlefield'],
              onClick: () => {
                const ids = new Set(stackDisplayList.map((sc) => sc.id));
                if (ids.size > 0) {
                  setSelection({ zone: 'stack', ids });
                }
                close();
              },
            },
            // Related "Token: …" items — same block as the battlefield
            // menu. Divider prefix when non-empty, otherwise omitted so
            // there's no dangling separator at the bottom of the menu.
            ...(() => {
              if (!card) {
                return [];
              }
              const tokens = [
                ...buildRelatedTokenItems(
                  cardMetaByName.get(card.name)?.related ?? [],
                  tokenMetaByName,
                  onCreateToken,
                ),
                ...buildTransformItems(
                  cardMetaByName.get(card.name),
                  Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                  card.name,
                  onCreateToken,
                ),
              ];
              return tokens.length > 0
                ? [{ divider: true } as CardMenuItem, ...tokens]
                : [];
            })(),
          ];
          return (
            <CardMenuPopup
              items={items}
              anchor={{ x: stackCardMenu.x, y: stackCardMenu.y }}
              disabled={!numeric}
              onClose={closeSeatCardMenu}
            />
          );
        })()}

      {/* Drag ghost — a floating copy of the dragged card(s) tracking the
          pointer. Group drags stack the cards with a small diagonal offset
          so the count is visible without hiding the top card. Only shows
          after the pointer crosses the movement threshold, so a click
          without motion never flashes the ghost.
          Library is a HiddenZone: the server's positional cardId (0 =
          top of ITS shuffle) is authoritative, and the client's local
          mock shuffle can't be matched to it. Showing the local top's
          face here would mislead the user into thinking THAT specific
          card is being moved — so library-source drags render a card
          back instead, matching the pile visualization. */}
      {seatDrag &&
        createPortal(
          <SeatDragGhost>
            {(origin) =>
              renderDragGhost(seatDrag.cards as readonly HandCard[], seatDrag.zone, seatDrag.lenderPlayerId !== undefined, origin)}
          </SeatDragGhost>,
          document.body,
        )}
    </div>
  );
}

export default forwardRef(PlayerBox);
