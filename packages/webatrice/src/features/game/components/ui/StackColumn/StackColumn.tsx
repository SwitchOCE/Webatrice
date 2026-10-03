import { useEffect, useRef, useState } from 'react';
import { useForkRef } from '@mui/material/utils';
import { ZoneName } from '@cockatrice/sockatrice';

import { layoutStackPile } from '../../battlefield/Battlefield/battlefieldLayout';
import { usePlayerSeatContext } from '../PlayerBoard/PlayerSeatContext';
import { CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';
import Card from '../SeatCard/SeatCard';
import { SELECTED_RING } from '../seatColors/seatColors';

/**
 * Stack column — sits in the play row (opposite the hand). Only
 * the battlefield is mirrored for top-row boxes; the stack
 * always renders in the same orientation.
 */
export default function StackColumn() {
  const {
    CARD_H_PX,
    CARD_W_PX,
    STACK_HOFFSET_PX,
    cardMetaByName,
    isDragging,
    isSelf,
    menuOwnerId,
    onCardDoubleClick,
    openSeatCardMenu,
    playerId,
    seatGrid,
    selection,
    stackDisplayList,
    stackZoneRef,
    startSeatCardDrag,
  } = usePlayerSeatContext();
  // The pile lays itself out in the space the column gives it.
  const sizeRef = useRef<HTMLDivElement>(null);
  const stackRef = useForkRef(stackZoneRef, sizeRef);
  const [stackSize, setStackSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = sizeRef.current;
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

  return (
    <div
      className="border-r border-border-subtle flex flex-col min-h-0 p-2"
      style={seatGrid.stack}
    >
      {/* Stack — spells/abilities waiting to resolve. Cards zig-zag
        vertically; index 0 renders topmost. Dropping between two
        existing cards inserts at that position. */}
      <div ref={stackRef} className="flex-1 min-h-0 relative">
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
                // Click to play resolves the card: an instant or sorcery
                // to the graveyard, anything else onto the battlefield.
                onDoubleClick={(e) => onCardDoubleClick('stack', c, e)}
                className="absolute hover:z-10"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  touchAction: isSelf ? 'none' : undefined,
                  cursor: isSelf ? 'grab' : 'default',
                  boxShadow: selected
                    ? SELECTED_RING
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
  );
}
