import { useState } from 'react';
import { motion } from 'motion/react';
import { Hand } from 'lucide-react';
import { ZoneName } from '@cockatrice/sockatrice';
import { usePreference } from '@app/hooks';
import { lookupCard } from '@app/services';

import { legacyTableRowFromTypeLine, tableRowToGridY } from '../../battlefield/Battlefield/cardPlacement';
import ContextMenu from '../../context-menus/ContextMenu/ContextMenu';
import { usePlayerSeatContext } from '../PlayerBoard/PlayerSeatContext';
import { CARD_BACK_URL, CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';
import Card from '../SeatCard/SeatCard';

/**
 * Hand — every player gets one; row flips based on handOnTop.
 * Idle: overflow-hidden clips cards to half their height so
 * the hand row only occupies half a card of vertical space.
 * Hovered: overflow-visible + z-30 lets cards render at full
 * height, floating over the play area WITHOUT reflowing the
 * grid (the reserved row height doesn't change). Alignment
 * per row direction so the visible half always sits toward
 * the screen edge and expansion goes toward the play area:
 *   • Bottom hand: items-end → bottom half visible, top half
 *     overflows upward into the play area on hover.
 *   • Top hand:    items-start → top half visible, bottom
 *     half overflows downward into the play area on hover.
 *
 * Nested structure — two problems solved:
 *   1. CSS silently promotes overflow-visible to auto when
 *      the other axis is auto/hidden, spawning a vertical
 *      scrollbar. Splitting vertical vs horizontal overflow
 *      across nested elements avoids the promotion.
 *   2. On hover, the bottom hand needs to "slide up" so the
 *      top half stays visible while the bottom half now sits
 *      inside the strip and the top half floats into the
 *      play area above. That's the transform on the inner
 *      container (top hand doesn't need it — its natural
 *      overflow direction IS toward the play area).
 * Layout invariant: cards render top-aligned in the strip so
 * the TOP half of every card (name / mana / art — the part
 * you actually need to read) is what's visible in idle.
 */
export default function HandZone() {
  const {
    cardMetaByName,
    flipHandCardBacks,
    handCount,
    handDisplayList,
    handMenuItems,
    handOnTop,
    handSize,
    handZoneRef,
    isDragging,
    isSelf,
    menuOwnerId,
    openSeatCardMenu,
    playerId,
    selection,
    setCardMetaByName,
    startSeatCardDrag,
    zoneCommands,
  } = usePlayerSeatContext();
  const playToStack = usePreference('playToStack');
  // Whether the hand row is being hovered — controls the auto-expand
  // that reveals full-size cards over the play area without reflowing
  // the shell (same pattern the PhaseTrack uses on the left edge).
  const [handExpanded, setHandExpanded] = useState(false);
  // Tracks whether the hand's slide tween is mid-flight. Combined with
  // `handExpanded` to keep the outer wrapper's `overflow-visible` on
  // until the return-to-idle animation actually finishes — otherwise
  // the wrapper clips its own cards mid-slide when hover ends.
  const [handAnimating, setHandAnimating] = useState(false);

  return (
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openSeatCardMenu({ kind: 'hand', playerId: menuOwnerId, cardId: c.id, x: e.clientX, y: e.clientY });
                    }}
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
                    // at the TOP of their seat (handOnTop). A
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
  );
}
