import { ZoneName } from '@cockatrice/sockatrice';

import type { BattlefieldCardViewModel, SeatMoveDestination } from '../../ui/PlayerBoard/playerBoard.types';
import { MAX_COUNTER_VALUE } from '../../ui/PlayerBoard/counterLimits';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { applyPTDelta, parsePT } from '../CardContextMenu/cardAttributeEdits';
import { CardMenuPopup } from '../CardContextMenu/CardContextMenu';
import { buildCardContextMenu, type CardMenuItem } from '../CardContextMenu/cardContextMenu.model';
import { buildRelatedTokenItems, buildTransformItems } from '../CardContextMenu/relatedCardActions';

/**
 * Card context menu — right-click a battlefield card to open.
 * All actions apply to a single card via its real numeric id;
 * the menu no-ops for optimistic mock cards without one.
 */
export default function BattlefieldCardMenu() {
  const {
    battlefieldDisplayList,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    closeSeatCardMenu,
    counterCommands,
    isSelf,
    lifeControl,
    openAnnotationPrompt,
    openCardCounterPrompt,
    openMoveXFromTopPrompt,
    openPTPrompt,
    relatedViewItemsFor,
    selection,
    setAttachExtraSourceIds,
    setAttachPending,
    setDrawArrowPending,
    setSelection,
    shortcutHints,
    targetCommands,
    tokenMetaByName,
    zoneCommands,
    zones,
  } = usePlayerSeatContext();

  return (
    <>
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
          // Selection state is scoped per seat, so an
          // opponent seat has its OWN selection here (used by
          // the viewer to visually group opponent cards).
          const targets: BattlefieldCardViewModel[] = card
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
              // seat, so calling `onDelta` on THIS seat's
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
              // Mirror the own-side handlers. Opponent seat
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
            ...(card ? relatedViewItemsFor(card.name) : []),
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
        const targetCards: BattlefieldCardViewModel[] =
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
          relatedViewItems: card ? relatedViewItemsFor(card.name) : [],
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
    </>
  );
}
