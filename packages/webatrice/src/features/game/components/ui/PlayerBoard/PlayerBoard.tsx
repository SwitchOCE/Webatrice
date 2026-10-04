import { createPortal } from 'react-dom';

import Battlefield from '../../battlefield/Battlefield/Battlefield';
import BattlefieldCardMenu from '../../context-menus/SeatCardMenus/BattlefieldCardMenu';
import HandCardMenu from '../../context-menus/SeatCardMenus/HandCardMenu';
import PileCardMenu from '../../context-menus/SeatCardMenus/PileCardMenu';
import StackCardMenu from '../../context-menus/SeatCardMenus/StackCardMenu';
import PlayerInfoPanel from '../../right-sidebar/PlayerInfoPanel/PlayerInfoPanel';
import HandZone from '../HandZone/HandZone';
import { CARD_BACK_URL, CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';
import { SeatDragGhost } from '../SeatDragContext';
import StackColumn from '../StackColumn/StackColumn';
import type { PlayerCardViewModel } from './playerBoard.types';
import PendingTargetArrows from './PendingTargetArrows';
import { PlayerSeatProvider } from './PlayerSeatContext';
import SeatDragGhostCards from './SeatDragGhostCards';
import { usePlayerSeat, type PlayerSeatProps } from './usePlayerSeat';

/**
 * One player's seat. Layout:
 *
 *   +-------+---------+--------------------+
 *   | Info  |         |                    |
 *   |       | Stack   |    Battlefield     |
 *   |       |         |                    |
 *   +       +---------+--------------------+
 *   |       |            Hand              |
 *   +-------+------------------------------+
 *
 * The info column (PlayerInfoPanel: name, life, mana pool and the ZoneStack
 * piles) spans both rows so the hand doesn't cut into it. Mirrored seats put
 * the hand row on top. Every seat shows a hand row; an opponent's shows card
 * backs for the server's hand count.
 *
 * PlayerBoard runs the seat controller (usePlayerSeat) over the seat model and
 * command ports, provides it to its regions through PlayerSeatContext, and
 * draws the seat-wide overlays: draw flights, the marquee, pending arrows, the
 * card menus and the drag ghost.
 */
function PlayerBoard(props: PlayerSeatProps) {
  const controller = usePlayerSeat(props);
  const {
    DRAW_ANIMATION_MS,
    boxRef,
    flights,
    handOnTop,
    isActive,
    marquee,
    onPointerDownBox,
    playerId,
    seatDrag,
    seatPending,
  } = controller;

  return (
    <PlayerSeatProvider value={controller}>
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
        <PlayerInfoPanel />

        <StackColumn />

        <Battlefield />

        <HandZone />

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

        {seatPending && <PendingTargetArrows playerId={playerId} pending={seatPending} />}

        <BattlefieldCardMenu />

        <PileCardMenu />

        <HandCardMenu />

        <StackCardMenu />

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
              <SeatDragGhostCards
                cards={seatDrag.cards as readonly PlayerCardViewModel[]}
                zone={seatDrag.zone}
                lent={seatDrag.lenderPlayerId !== undefined}
                origin={origin}
              />}
          </SeatDragGhost>,
          document.body,
        )}
      </div>
    </PlayerSeatProvider>
  );
}

export default PlayerBoard;
