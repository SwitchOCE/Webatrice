import { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Hand, Heart, Skull, Sparkles } from 'lucide-react';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { ManaSymbols } from '../ui/ManaSymbols/ManaSymbols';
import {
  BATTLEFIELD_ROWS,
  computeCellWidths,
  rowTopY,
  slotOriginPx,
  layoutStackPile,
  type BattlefieldLayoutOpts,
} from '../battlefield/Battlefield/battlefieldLayout';
import { legacyTableRowFromTypeLine, tableRowToGridY } from '../battlefield/Battlefield/cardPlacement';
import { applyPTDelta, parsePT } from '../context-menus/CardContextMenu/cardAttributeEdits';
import { buildCardContextMenu, type CardMenuItem } from '../context-menus/CardContextMenu/cardContextMenu.model';
import { CardMenuPopup } from '../context-menus/CardContextMenu/CardContextMenu';
import { buildRelatedTokenItems, buildTransformItems } from '../context-menus/CardContextMenu/relatedCardActions';
import type { BattlefieldCardViewModel, PlayerCardViewModel, SeatMoveCard, SeatMoveDestination } from '../ui/PlayerBoard/playerBoard.types';
import { CardImage } from '@app/components';
import { usePreference, useSnapGridVisible } from '@app/hooks';
import {
  CARD_BACK_URL,
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_SIDEWAYS_HEIGHT,
  CARD_SIDEWAYS_WIDTH,
  CARD_WIDTH,
} from '../ui/SeatCard/cardSize';
import ContextMenu from '../context-menus/ContextMenu/ContextMenu';
import Card from '../ui/SeatCard/SeatCard';
import { useCardPreviewActions } from '../ui/CardPreviewContext';
import { makeCardKey } from '../../utils/CardRegistry/CardRegistryContext';
import { SeatDragGhost, SeatDropPreview } from '../ui/SeatDragContext';
import { PlayerPlaymat } from '../PlayerPlaymat';
import { buildArrowGeometry } from '../arrows/GameArrowOverlay/arrowPath';
import { ArrowColor, rgbaToCss } from '@app/types';
import { lookupCard } from '@app/services';
import { usePlayerSeat, type PlayerSeatProps } from '../ui/PlayerBoard/usePlayerSeat';
import { MANA_COLORS } from '../right-sidebar/PlayerInfoPanel/manaColors';
import { toRecipient } from '../ui/PlayerBoard/revealRecipient';

type HandCard = PlayerCardViewModel;
type BattlefieldCard = BattlefieldCardViewModel;

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

/** Cockatrice's `DlgMoveTopCardsUntil`. Reveals library cards from
 *  the top one at a time, moving each to the stack, until N cards
 *  matching the name are found (or the library runs out). Optional
 *  auto-play plays each matched card. Simplified from Cockatrice:
 *  match is a case-insensitive substring of the card name (Cockatrice
 *  supports a filter DSL — MVP just does name match). */
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

function PlayerBox(props: PlayerSeatProps) {
  const controller = usePlayerSeat(props);
  // User-interface preferences (Settings → User Interface).
  const playToStack = usePreference('playToStack');
  const tapAnimation = usePreference('tapAnimation');
  const {
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
  } = controller;

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
            backgroundImage: seat.avatarUrl
              ? `url(${seat.avatarUrl})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!seat.avatarUrl && (
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
                isSelf && counter != null;
              const pip = (
                <ManaPip
                  symbol={m.symbol}
                  label={m.label}
                  tint={m.tint}
                  count={manaPool[m.symbol]}
                  onIncrement={
                    canModify
                      ? () => counterCommands.increment(counter.id, 1)
                      : undefined
                  }
                  onDecrement={
                    canModify
                      ? () => counterCommands.increment(counter.id, -1)
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
                    openDrawCardsPrompt({ deckSize: deckCount }),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.drawMultipleCards'],
                },
                {
                  label: 'Undo last draw',
                  onClick: () => zoneCommands.undoDraw(),
                  // No client-side gate — the server rejects when
                  // there's nothing to undo (matches Cockatrice, which
                  // also always shows the item enabled).
                  shortcut: shortcutHints['game.undoDraw'],
                },
                { divider: true },
                {
                  label: 'Shuffle',
                  onClick: () => {
                    zoneCommands.shuffleLibrary();
                  },
                  disabled: deckCount <= 1,
                  shortcut: shortcutHints['game.shuffleLibrary'],
                },
                { divider: true },
                {
                  // "View library" — the zone view dumps the whole library
                  // (Command_DumpZone with numberCards=-1). Mirrors
                  // Cockatrice's actViewLibrary (player_actions.cpp).
                  label: 'View library',
                  onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK }),
                  disabled: deckCount <= 0,
                  shortcut: shortcutHints['game.viewLibrary'],
                },
                {
                  label: 'View top cards of library...',
                  onClick: () =>
                    openViewLibraryCountPrompt({
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
                    openViewLibraryCountPrompt({
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
                            onClick: () => zoneCommands.reveal(ZoneName.DECK, toRecipient(-1)),
                          },
                          { divider: true },
                          ...revealTargets.map((t) => ({
                            label: t.name,
                            onClick: () => zoneCommands.reveal(ZoneName.DECK, toRecipient(t.playerId)),
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
                          onClick: () => zoneCommands.lendLibrary(t.playerId),
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
                    zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard),
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
                    zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard),
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
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [0], { zone: ZoneName.STACK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Play top card face down',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [{ id: 0, faceDown: true }], { zone: ZoneName.TABLE, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Put top card on bottom',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [0], { zone: ZoneName.DECK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Move top card to graveyard',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [0], { zone: ZoneName.GRAVE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to graveyard...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
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
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top card to exile',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [0], { zone: ZoneName.EXILE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move top cards to exile...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
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
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      // "Put top cards on stack until..." — Cockatrice
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
                            // Command_Shuffle range is inclusive on
                            // both ends: [0, N-1] shuffles positions
                            // 0..N-1 (player_actions.cpp:267-268).
                            zoneCommands.shuffleLibrary({ start: 0, end: count - 1 });
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
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.HAND });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Draw bottom cards...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.HAND });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Play bottom card',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.STACK, index: 'end' });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Play bottom card face down',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [{ id: deckCount - 1, faceDown: true }], {
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
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.DECK });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    { divider: true },
                    {
                      label: 'Move bottom card to graveyard',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.GRAVE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom cards to graveyard...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
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
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.GRAVE });
                          },
                        });
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom card to exile',
                      onClick: () => {
                        if (deckCount > 0) {
                          zoneCommands.moveCards(ZoneName.DECK, [deckCount - 1], { zone: ZoneName.EXILE });
                        }
                      },
                      disabled: deckCount <= 0,
                    },
                    {
                      label: 'Move bottom cards to exile...',
                      onClick: () => {
                        const size = deckCount;
                        if (
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
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
                          size <= 0
                        ) {
                          return;
                        }
                        openCountPrompt({
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
                            zoneCommands.moveCards(ZoneName.DECK, cards, { zone: ZoneName.EXILE });
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
                            // `[-N, -1]` — negative indices count from
                            // the end (server accepts either sign;
                            // Cockatrice desktop always sends negative
                            // for bottom, :298-299).
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
                          !Number.isFinite(cardId)
                        ) {
                          return;
                        }
                        let typeLine =
                          cardMetaByName.get(c.name)?.typeLine ??
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
                          zoneCommands.moveCards(ZoneName.STACK, [cardId], { zone: ZoneName.GRAVE, index: 'end' });
                        } else {
                          zoneCommands.moveCards(ZoneName.STACK, [cardId], {
                            zone: ZoneName.TABLE,
                            index: 'end',
                            row: tableRowToGridY(tableRow),
                          });
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
          data-battlefield-owner={String(playerId)}
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
                            cardCommands.setTapped(wireIds, nextTapped);
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
                          !Number.isFinite(cardId)
                        ) {
                          return;
                        }
                        let typeLine =
                          cardMetaByName.get(c.name)?.typeLine ??
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
                          zoneCommands.moveCards(ZoneName.HAND, [cardId], {
                            zone: ZoneName.TABLE,
                            index: 'end',
                            row: tableRowToGridY(tableRow),
                          });
                        } else {
                          // Detour through the stack so the spell is visible
                          // before it resolves.
                          zoneCommands.moveCards(ZoneName.HAND, [cardId], { zone: ZoneName.STACK, index: 'end' });
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
                  if (targets.length > 0) {
                    for (const bc of targets) {
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
                    cardCommands.createToken,
                  ),
                  ...buildTransformItems(
                    cardMetaByName.get(card.name),
                    Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                    card.name,
                    cardCommands.createToken,
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
            if (targetIds.length === 0) {
              return;
            }
            // Single Command_MoveCard with cards_to_move populated for
            // every selected card — matches Cockatrice's batched
            // move (cardsToMove is a repeated field).
            zoneCommands.moveCards(ZoneName.TABLE, targetIds, { reversed: false, ...to });
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
          // Single cardCommands.setPT batch keeps the wire atomic.
          const dispatchPTDelta = (dp: number, dt: number) => {
            if (targetCards.length === 0) {
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
              cardCommands.setPT(entries);
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
                cardCommands.createToken,
              ),
              ...buildTransformItems(
                cardMetaByName.get(card.name),
                Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                card.name,
                cardCommands.createToken,
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
              if (targetIds.length > 0 && card) {
                cardCommands.setTapped(targetIds, !card.tapped);
              }
              close();
            },
            onFlip: () => {
              // Batch each selected card's flip individually — wire
              // takes a single cardId. Uses the clicked card's
              // current faceDown to drive the target value so a
              // mixed selection unifies.
              if (targetIds.length > 0) {
                const target = !card?.faceDown;
                for (const id of targetIds) {
                  cardCommands.flip(id, target);
                }
              }
              close();
            },
            onPeek: () => {
              // Only peek face-down cards in the selection — face-up
              // cards are already known to us, so a peek is noise.
              if (!cardCommands.peek || targetCards.length === 0) {
                close();
                return;
              }
              const ids = targetCards
                .filter((bc) => bc.faceDown)
                .map((bc) => Number(bc.id))
                .filter((n) => Number.isFinite(n));
              if (ids.length > 0) {
                cardCommands.peek(ids);
              }
              close();
            },
            onSkipUntapping: () => {
              if (targetIds.length > 0) {
                const target = !card?.doesntUntap;
                for (const id of targetIds) {
                  cardCommands.setDoesntUntap(id, target);
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
              if (targetCards.length > 0) {
                for (const bc of targetCards) {
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
                const deckSize = zones.library.cardCount ?? 0;
                openMoveXFromTopPrompt({
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
              if (targetCards.length === 0) {
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
                cardCommands.setPT(entries);
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
              for (const id of targetIds) {
                targetCommands.unattach(id);
              }
              close();
            },
            onAddCardCounter: (counterId: number) => {
              // Batch: each selected card computes its OWN cur+1
              // (independent of the clicked card's value) so a mixed
              // selection doesn't get truncated. Uses the atomic
              // bulk-set helper so all cards land in one wire.
              if (targetCards.length > 0) {
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
                  counterCommands.setCardCounters(entries);
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

      {/* Pile-view card context menu — right-click a card inside a
          graveyard / exile zone view. View-only shape: Draw arrow /
          Clone / Select All / Select Column, matching Cockatrice's
          card-in-ZoneView menu. Uses the same CardMenuPopup renderer
          as the battlefield menu — only the item set differs. */}
      {pileCardMenu &&
        (() => {
          const cardIdNum = Number(pileCardMenu.cardId);
          const numeric = Number.isFinite(cardIdNum);
          const close = closeSeatCardMenu;
          // The view's selection is the game selection, keyed by this
          // pile. Select All / Select Column replace it with the view's
          // cards or the clicked card's column (desktop actSelectAll /
          // actSelectColumn over the ZoneView); Clone then applies to the
          // selection when the clicked card is part of it, like desktop's
          // aClone over the selected cards. Draw arrow stays single-card
          // (desktop actDrawArrow uses the active card).
          const pileKey = (id: string) => makeCardKey(menuOwnerId, pileCardMenu.zone, Number(id));
          const selectPileCards = (ids: readonly string[]) => {
            gameSelection?.setSelectedCardKeys(new Set(ids.map(pileKey)));
            close();
          };
          const selectedInView = pileCardMenu.viewCardIds.filter(
            (id) => gameSelection?.selectedCardKeys.has(pileKey(id)),
          );
          const cloneIds = selectedInView.includes(pileCardMenu.cardId)
            ? selectedInView
            : [pileCardMenu.cardId];
          const pileCards = pileCardMenu.zone === ZoneName.GRAVE ? graveDisplayList : exileDisplayList;
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
                    sourceZone: pileCardMenu.zone as ZoneNameValue,
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
                  for (const id of cloneIds) {
                    const pileCard = pileCards.find((pc) => pc.id === id);
                    if (pileCard) {
                      cardCommands.clone({
                        name: pileCard.name,
                        providerId: pileCard.scryfallId,
                        color: '',
                        pt: '',
                        annotation: '',
                        y: 0,
                      });
                    }
                  }
                }
                close();
              },
            },
            {
              label: 'Select All',
              shortcut: shortcutHints['game.selectAllBattlefield'],
              onClick: () => selectPileCards(pileCardMenu.viewCardIds),
            },
            {
              label: 'Select Column',
              shortcut: shortcutHints['game.selectColumnBattlefield'],
              onClick: () => selectPileCards(pileCardMenu.columnCardIds),
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
                  if (targets.length > 0) {
                    for (const sc of targets) {
                      if (!Number.isFinite(Number(sc.id))) {
                        continue;
                      }
                      cardCommands.clone({
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
                    cardCommands.createToken,
                  ),
                  ...buildTransformItems(
                    cardMetaByName.get(card.name),
                    Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                    card.name,
                    cardCommands.createToken,
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
            if (targetIds.length === 0) {
              return;
            }
            zoneCommands.moveCards(ZoneName.STACK, targetIds, { reversed: false, ...to });
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
                if (targetIds.length === 0) {
                  close();
                  return;
                }
                zoneCommands.moveCards(
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
                if (targets.length > 0) {
                  for (const sc of targets) {
                    if (!Number.isFinite(Number(sc.id))) {
                      continue;
                    }
                    cardCommands.clone({
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
                  cardCommands.createToken,
                ),
                ...buildTransformItems(
                  cardMetaByName.get(card.name),
                  Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                  card.name,
                  cardCommands.createToken,
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

export default PlayerBox;
