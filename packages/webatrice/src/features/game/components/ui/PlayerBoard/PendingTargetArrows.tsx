import { createPortal } from 'react-dom';
import { ArrowColor, rgbaToCss } from '@app/types';

import { usePendingPointer, type PendingTarget } from '../../../hooks/usePendingTarget';
import { buildArrowGeometry } from '../../arrows/GameArrowOverlay/arrowPath';
import { usePendingTargetContext } from '../PendingTargetContext';

type Geom = NonNullable<ReturnType<typeof buildArrowGeometry>>;

/**
 * The live arrow of a pick started from this seat, from the source card to
 * the cursor: green for "Attach to card...", red for "Draw arrow...". Ports
 * Cockatrice's ArrowAttachItem / ArrowDragItem mouse-grabbed visuals
 * (arrow_item.cpp:177+, 288+) with the curved-leaf path the right-button drag
 * uses. Only this component follows the pointer, so a mouse move doesn't
 * re-render the seats.
 */
function PendingTargetArrows({ playerId, pending }: { playerId: number; pending: PendingTarget }) {
  const pointer = usePendingPointer(usePendingTargetContext().pointer);
  if (!pointer) {
    return null;
  }
  const color = pending.kind === 'attach' ? ArrowColor.GREEN : ArrowColor.RED;
  // An attach draws one arrow per card it attaches, all converging on the
  // pointer; an arrow pick has one source.
  const sourceIds: readonly number[] = pending.kind === 'attach'
    ? [pending.source.cardId, ...pending.extraSourceIds]
    : [pending.source.cardId];
  // Cockatrice's ArrowItem::paint uses alpha 150 while unlocked and 200 when
  // snapped to a target. A pick resolves on click, so there is no snap
  // preview: always 200, to read as "committed direction".
  const fill = rgbaToCss({ ...color, a: 200 });
  const ownerSel = CSS.escape(String(playerId));
  const zoneSel = CSS.escape(pending.source.zone);
  const geoms: { sourceId: number; geom: Geom }[] = [];
  for (const sourceId of sourceIds) {
    // Each source card is found by its data attributes, so no ref has to be
    // plumbed out of the zones' render loops.
    const el = document.querySelector<HTMLElement>(
      `[data-card-id="${CSS.escape(String(sourceId))}"][data-card-owner="${ownerSel}"][data-card-zone="${zoneSel}"]`,
    );
    if (!el) {
      continue;
    }
    const r = el.getBoundingClientRect();
    const geom = buildArrowGeometry(r.left + r.width / 2, r.top + r.height / 2, pointer.x, pointer.y);
    if (geom) {
      geoms.push({ sourceId, geom });
    }
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
      data-testid="pending-target-arrows"
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
}

export default PendingTargetArrows;
