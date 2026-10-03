import { ZoneName } from '@cockatrice/sockatrice';
import { lookupCard } from '@app/services';

import { layoutStackPile } from '../../battlefield/Battlefield/battlefieldLayout';
import { legacyTableRowFromTypeLine, tableRowToGridY } from '../../battlefield/Battlefield/cardPlacement';
import { usePlayerSeatContext } from '../PlayerBoard/PlayerSeatContext';
import { CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';
import Card from '../SeatCard/SeatCard';

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
    handOnTop,
    isDragging,
    isSelf,
    menuOwnerId,
    openSeatCardMenu,
    playerId,
    selection,
    setCardMetaByName,
    stackDisplayList,
    stackSize,
    stackZoneRef,
    startSeatCardDrag,
    zoneCommands,
  } = usePlayerSeatContext();

  return (
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
  );
}
