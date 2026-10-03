import { createPortal } from 'react-dom';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { applyPTDelta, parsePT } from '../context-menus/CardContextMenu/cardAttributeEdits';
import { buildCardContextMenu, type CardMenuItem } from '../context-menus/CardContextMenu/cardContextMenu.model';
import { CardMenuPopup } from '../context-menus/CardContextMenu/CardContextMenu';
import { buildRelatedTokenItems, buildTransformItems } from '../context-menus/CardContextMenu/relatedCardActions';
import type {
  BattlefieldCardViewModel,
  PlayerCardViewModel,
  SeatMoveDestination,
} from '../ui/PlayerBoard/playerBoard.types';
import { CARD_BACK_URL, CARD_CORNER_RADIUS, CARD_HEIGHT, CARD_WIDTH } from '../ui/SeatCard/cardSize';
import { makeCardKey } from '../../utils/CardRegistry/CardRegistryContext';
import { SeatDragGhost } from '../ui/SeatDragContext';
import { buildArrowGeometry } from '../arrows/GameArrowOverlay/arrowPath';
import { ArrowColor, rgbaToCss } from '@app/types';
import { usePlayerSeat, type PlayerSeatProps } from '../ui/PlayerBoard/usePlayerSeat';
import { PlayerSeatProvider } from '../ui/PlayerBoard/PlayerSeatContext';
import StackColumn from '../ui/StackColumn/StackColumn';
import HandZone from '../ui/HandZone/HandZone';
import Battlefield from '../battlefield/Battlefield/Battlefield';
import PlayerInfoPanel from '../right-sidebar/PlayerInfoPanel/PlayerInfoPanel';

type HandCard = PlayerCardViewModel;
type BattlefieldCard = BattlefieldCardViewModel;

function PlayerBox(props: PlayerSeatProps) {
  const controller = usePlayerSeat(props);
  const {
    DRAW_ANIMATION_MS,
    MAX_COUNTER_VALUE,
    attachExtraSourceIds,
    attachPending,
    battlefieldDisplayList,
    boxRef,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    closeSeatCardMenu,
    counterCommands,
    drawArrowPending,
    exileDisplayList,
    flights,
    gameSelection,
    graveDisplayList,
    handOnTop,
    isActive,
    isSelf,
    lifeControl,
    marquee,
    menuOwnerId,
    onPointerDownBox,
    openAnnotationPrompt,
    openCardCounterPrompt,
    openMoveXFromTopPrompt,
    openPTPrompt,
    pendingArrowPointer,
    pileCardMenu,
    playerId,
    renderDragGhost,
    seatDrag,
    selection,
    setAttachExtraSourceIds,
    setAttachPending,
    setDrawArrowPending,
    setSelection,
    shortcutHints,
    stackCardMenu,
    stackDisplayList,
    targetCommands,
    tokenMetaByName,
    zoneCommands,
    zones,
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
    </PlayerSeatProvider>
  );
}

export default PlayerBox;
