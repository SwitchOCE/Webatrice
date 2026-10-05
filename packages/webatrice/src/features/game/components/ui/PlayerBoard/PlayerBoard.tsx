import { createPortal } from 'react-dom';

import Battlefield from '../../battlefield/Battlefield/Battlefield';
import { DragSelectionCount } from '../../SelectionCount/SelectionCount';
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
import { MARQUEE_BORDER, MARQUEE_FILL } from '../seatColors/seatColors';

/**
 * One player's seat: the info column (PlayerInfoPanel: name, life, mana pool
 * and the ZoneStack piles), the stack, the battlefield and the hand, placed by
 * seatGrid. With desktop's default horizontal hand, the hand is a row under
 * the stack and battlefield (above them on a mirrored seat); with a vertical
 * hand it is a column beside the info column. Every seat shows a hand; an
 * opponent's shows card backs for the server's hand count.
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
    isActive,
    marquee,
    onPointerDownBox,
    playerId,
    seatDrag,
    seatGrid,
    seatPending,
  } = controller;

  return (
    <PlayerSeatProvider value={controller}>
      <div
        ref={boxRef}
        onPointerDown={onPointerDownBox}
        className={[
          'h-full min-h-0 rounded-lg border overflow-hidden bg-bg-surface/60 backdrop-blur-sm board-motion transition-shadow select-none',
          isActive ? 'border-accent' : 'border-border-subtle',
        ].join(' ')}
        style={{
          display: 'grid',
          ...seatGrid.template,
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
              border: MARQUEE_BORDER,
              background: MARQUEE_FILL,
              pointerEvents: 'none',
              zIndex: 275,
            }}
          >
            <DragSelectionCount band={marquee} count={marquee.count} />
          </div>,
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
