import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import { makeCardKey } from '../../../utils/CardRegistry/CardRegistryContext';
import { legacyTableRowFromTypeLine, tableRowToGridY } from '../../battlefield/Battlefield/cardPlacement';
import type { PlayerCardViewModel, SeatMoveDestination } from '../../ui/PlayerBoard/playerBoard.types';
import { useCanActFor } from '../../ui/CardVisualStateContext';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { toRecipient } from '../../ui/PlayerBoard/revealRecipient';
import { CardMenuPopup } from '../CardContextMenu/CardContextMenu';
import { buildHandOrZoneCardMenu } from '../CardContextMenu/handCardMenu.model';
import { buildRelatedTokenItems } from '../CardContextMenu/relatedCardActions';

/**
 * Hand and library / sideboard zone-view card menu — desktop's
 * CardMenu::createHandOrCustomZoneMenu (card_menu.cpp:296-342). The items
 * come from handCardMenu.model; this component resolves the target cards
 * and wires the seat's ports. Actions apply to the selection when the
 * clicked card is part of it (desktop's selectedCards), else to the
 * clicked card.
 */
export default function HandCardMenu() {
  const {
    cardCommands,
    cardMetaByName,
    closeSeatCardMenu,
    deckCount,
    gameSelection,
    handCardMenu,
    handDisplayList,
    menuOwnerId,
    openMoveXFromTopPrompt,
    relatedViewItemsFor,
    revealTargets,
    selection,
    setDrawArrowPending,
    setSelection,
    shortcutHints,
    tokenMetaByName,
    zoneCommands,
    zoneViewCardMenu,
    zones,
  } = usePlayerSeatContext();
  // Write access to this seat's cards: the owner, or a judge.
  const canModify = useCanActFor()(menuOwnerId);

  const menu = handCardMenu ?? zoneViewCardMenu;
  if (!menu) {
    return null;
  }
  const close = closeSeatCardMenu;
  const zone = (zoneViewCardMenu?.zone ?? ZoneName.HAND) as ZoneNameValue;
  const zoneCards: readonly PlayerCardViewModel[] = zoneViewCardMenu
    ? (zone === ZoneName.SIDEBOARD ? zones.sideboard.revealedCards : zones.library.revealedCards)
    : handDisplayList;
  const viewKey = (id: string) => makeCardKey(menuOwnerId, zone, Number(id));
  let targetIdStrings: string[];
  if (zoneViewCardMenu) {
    const selectedInView = zoneViewCardMenu.viewCardIds.filter(
      (id) => gameSelection?.selectedCardKeys.has(viewKey(id)),
    );
    targetIdStrings = selectedInView.includes(menu.cardId) ? selectedInView : [menu.cardId];
  } else {
    targetIdStrings = selection?.zone === 'hand' && selection.ids.has(menu.cardId)
      ? Array.from(selection.ids)
      : [menu.cardId];
  }
  const targets = targetIdStrings
    .map((id) => zoneCards.find((c) => c.id === id))
    .filter((c): c is PlayerCardViewModel => c != null && Number.isFinite(Number(c.id)));
  const targetIds = targets.map((c) => Number(c.id));
  const card = zoneCards.find((c) => c.id === menu.cardId);
  const cardName = card?.name ?? (zoneViewCardMenu?.cardName ?? '');
  const cardIdNum = Number(menu.cardId);
  const numeric = Number.isFinite(cardIdNum);
  const run = (fn: () => void) => () => {
    fn();
    close();
  };
  const moveTargets = (to: SeatMoveDestination) => {
    if (targetIds.length > 0) {
      zoneCommands.moveCards(zone, targetIds, { reversed: false, ...to });
    }
  };
  const selectInView = (ids: readonly string[]) =>
    gameSelection?.setSelectedCardKeys(new Set(ids.map(viewKey)));
  const items = buildHandOrZoneCardMenu({
    shortcutHints,
    source: handCardMenu ? 'hand' : 'zoneView',
    canModify,
    revealTargets,
    // Desktop playCard: tablerow 3 goes to the stack, anything else
    // to its battlefield row; face down always to row 2
    // (player_actions.cpp:51-98). One command per card.
    onPlay: run(() => {
      for (const c of targets) {
        const tableRow = legacyTableRowFromTypeLine(cardMetaByName.get(c.name)?.typeLine ?? '');
        zoneCommands.moveCards(zone, [Number(c.id)], tableRow === 3
          ? { zone: ZoneName.STACK, index: 'end' }
          : { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(tableRow) });
      }
    }),
    onPlayFaceDown: run(() => {
      for (const id of targetIds) {
        zoneCommands.moveCards(zone, [{ id, faceDown: true }], { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(2) });
      }
    }),
    onReveal: (targetPlayerId) => run(() => {
      if (targetIds.length > 0) {
        zoneCommands.reveal(zone, toRecipient(targetPlayerId), { cardIds: targetIds });
      }
    })(),
    onClone: run(() => {
      for (const c of targets) {
        cardCommands.clone({ name: c.name, providerId: c.scryfallId, color: '', pt: '', annotation: '', y: 0 });
      }
    }),
    onMove: (target) => run(() => {
      switch (target) {
        case 'libraryTop':
          return moveTargets({ zone: ZoneName.DECK });
        case 'libraryBottom':
          return moveTargets({ zone: ZoneName.DECK, reversed: true });
        case 'libraryXFromTop':
          if (numeric) {
            openMoveXFromTopPrompt({ cardId: cardIdNum, cardName, deckSize: deckCount, fromZone: zone });
          }
          return;
        case 'table':
          return moveTargets({ zone: ZoneName.TABLE });
        case 'hand':
          return moveTargets({ zone: ZoneName.HAND });
        case 'grave':
          return moveTargets({ zone: ZoneName.GRAVE });
        case 'exile':
          return moveTargets({ zone: ZoneName.EXILE });
      }
    })(),
    onDrawArrow: run(() => {
      if (numeric) {
        setDrawArrowPending({ sourceCardId: cardIdNum, sourceCardName: cardName, sourceZone: zone });
      }
    }),
    onSelectAll: run(() => {
      if (zoneViewCardMenu) {
        selectInView(zoneViewCardMenu.viewCardIds);
      } else if (handDisplayList.length > 0) {
        setSelection({ zone: 'hand', ids: new Set(handDisplayList.map((c) => c.id)) });
      }
    }),
    onSelectColumn: zoneViewCardMenu
      ? run(() => selectInView(zoneViewCardMenu.columnCardIds))
      : undefined,
    relatedViewItems: relatedViewItemsFor(cardName),
    tokenItems: buildRelatedTokenItems(
      cardMetaByName.get(cardName)?.related ?? [],
      tokenMetaByName,
      cardCommands.createToken,
    ),
  });
  return (
    <CardMenuPopup
      items={items}
      anchor={{ x: menu.x, y: menu.y }}
      disabled={!numeric}
      onClose={closeSeatCardMenu}
    />
  );
}
