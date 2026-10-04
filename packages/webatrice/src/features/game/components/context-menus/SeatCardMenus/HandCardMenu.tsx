import { useCanActFor } from '../../ui/CardVisualStateContext';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { toRecipient } from '../../ui/PlayerBoard/revealRecipient';
import { CardMenuPopup } from '../CardContextMenu/CardContextMenu';
import { resolveHandOrZoneCardMenu } from '../CardContextMenu/handCardMenu.actions';
import { buildRelatedTokenItems } from '../CardContextMenu/relatedCardActions';

const EMPTY_CARD_KEYS: ReadonlySet<string> = new Set();

/**
 * Hand and library / sideboard zone-view card menu — desktop's
 * CardMenu::createHandOrCustomZoneMenu (card_menu.cpp:296-342). The items
 * and their actions resolve in resolveHandOrZoneCardMenu over the seat's
 * state and ports.
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
    startDrawArrow,
    setSelection,
    shortcutHints,
    tokenMetaByName,
    zoneCommands,
    zoneViewCardMenu,
    zones,
  } = usePlayerSeatContext();
  // Write access to this seat's cards: the owner, or a judge.
  const canModify = useCanActFor()(menuOwnerId);

  const menu = resolveHandOrZoneCardMenu({
    menu: handCardMenu ?? zoneViewCardMenu,
    ownerId: menuOwnerId,
    shortcutHints,
    canModify,
    revealTargets,
    handCards: handDisplayList,
    libraryViewCards: zones.library.revealedCards,
    sideboardCards: zones.sideboard.revealedCards,
    handSelection: selection,
    setHandSelection: setSelection,
    selectedCardKeys: gameSelection?.selectedCardKeys ?? EMPTY_CARD_KEYS,
    setSelectedCardKeys: (keys) => gameSelection?.setSelectedCardKeys(new Set(keys)),
    cardMeta: (name) => cardMetaByName.get(name),
    deckSize: deckCount,
    moveCards: zoneCommands.moveCards,
    revealCards: (zone, targetPlayerId, cardIds) => zoneCommands.reveal(zone, toRecipient(targetPlayerId), { cardIds }),
    cloneCard: cardCommands.clone,
    promptMoveXFromTop: openMoveXFromTopPrompt,
    startArrow: startDrawArrow,
    relatedViewItems: relatedViewItemsFor,
    tokenItems: (name) => buildRelatedTokenItems(cardMetaByName.get(name)?.related ?? [], tokenMetaByName, cardCommands.createToken),
    close: closeSeatCardMenu,
  });
  return menu && <CardMenuPopup {...menu} onClose={closeSeatCardMenu} />;
}
