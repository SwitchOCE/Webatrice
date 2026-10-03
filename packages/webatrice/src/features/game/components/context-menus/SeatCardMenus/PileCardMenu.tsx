import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import { makeCardKey } from '../../../utils/CardRegistry/CardRegistryContext';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { CardMenuPopup } from '../CardContextMenu/CardContextMenu';
import { type CardMenuItem } from '../CardContextMenu/cardContextMenu.model';

/**
 * Pile-view card context menu — right-click a card inside a
 * graveyard / exile zone view. View-only shape: Draw arrow /
 * Clone / Select All / Select Column, matching Cockatrice's
 * card-in-ZoneView menu. Uses the same CardMenuPopup renderer
 * as the battlefield menu — only the item set differs.
 */
export default function PileCardMenu() {
  const {
    cardCommands,
    closeSeatCardMenu,
    exileDisplayList,
    gameSelection,
    graveDisplayList,
    menuOwnerId,
    pileCardMenu,
    setDrawArrowPending,
    shortcutHints,
  } = usePlayerSeatContext();

  return (
    <>
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
    </>
  );
}
