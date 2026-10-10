import { usePreference } from '@app/hooks';
import { useTranslation } from 'react-i18next';

import { useCanActFor } from '../../ui/CardVisualStateContext';
import { EMPTY_CARD_KEYS } from '../../ui/GameSelectionContext';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { toRecipient } from '../../ui/PlayerBoard/revealRecipient';
import { resolveHandOrZoneCardMenu } from '../CardContextMenu/handCardMenu.actions';
import { buildRelatedTokenItems } from '../CardContextMenu/relatedCardActions';
import { ContextMenuPopup } from '../ContextMenu/ContextMenu';

export default function HandCardMenu() {
  const { t } = useTranslation();
  const playToStack = usePreference('playToStack');
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
    menuShortcut,
    tokenMetaByName,
    zoneCommands,
    zoneViewCardMenu,
    zones,
  } = usePlayerSeatContext();
  const annotateTokens = usePreference('annotateTokens');
  const canModify = useCanActFor()(menuOwnerId);

  const menu = resolveHandOrZoneCardMenu({
    t,
    menu: handCardMenu ?? zoneViewCardMenu,
    ownerId: menuOwnerId,
    menuShortcut,
    canModify,
    revealTargets,
    handCards: handDisplayList,
    libraryViewCards: zones.library.revealedCards,
    sideboardCards: zones.sideboard.revealedCards,
    handSelection: selection,
    setHandSelection: setSelection,
    selectedCardKeys: gameSelection?.selectedCardKeys ?? EMPTY_CARD_KEYS,
    setSelectedCardKeys: (keys) => gameSelection?.setSelectedCardKeys(keys),
    cardMeta: (name) => cardMetaByName.get(name),
    deckSize: deckCount,
    playToStack,
    moveCards: zoneCommands.moveCards,
    revealCards: (zone, targetPlayerId, cardIds) => zoneCommands.reveal(zone, toRecipient(targetPlayerId), { cardIds }),
    cloneCard: cardCommands.clone,
    promptMoveXFromTop: openMoveXFromTopPrompt,
    startArrow: startDrawArrow,
    relatedViewItems: relatedViewItemsFor,
    tokenItems: (name) =>
      buildRelatedTokenItems(t, cardMetaByName.get(name)?.related ?? [], tokenMetaByName, cardCommands.createToken, annotateTokens),
    close: closeSeatCardMenu,
  });
  return menu && <ContextMenuPopup {...menu} onClose={closeSeatCardMenu} />;
}
