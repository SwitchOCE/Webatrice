import { ZoneName } from '@cockatrice/sockatrice';
import { usePreference } from '@app/hooks';

import type { BattlefieldCardOps } from '../../ui/PlayerBoard/useBattlefieldCardOps';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { buildCardContextMenu, buildOpponentCardMenu } from '../CardContextMenu/cardContextMenu.model';
import { ContextMenuPopup, type ContextMenuItem } from '../ContextMenu/ContextMenu';
import { buildRelatedActionItems } from '../CardContextMenu/relatedCardActions';

/**
 * The battlefield card menu: right-click a battlefield card to open. Each item
 * runs the seat's battlefield card op on the clicked card, or on the whole
 * selection when the clicked card is part of it (useBattlefieldCardOps), then
 * closes. The menu is disabled on an optimistic card without a server id.
 */
export default function BattlefieldCardMenu() {
  const {
    battlefieldDisplayList,
    cardCommands,
    cardContextMenu,
    cardMetaByName,
    cardOps,
    closeSeatCardMenu,
    isSelf,
    relatedViewItemsFor,
    menuShortcut,
    tokenMetaByName,
  } = usePlayerSeatContext();
  // Desktop's "Annotate card text on tokens".
  const annotateTokens = usePreference('annotateTokens');

  if (!cardContextMenu) {
    return null;
  }
  const card = battlefieldDisplayList.find((bc) => bc.id === cardContextMenu.cardId);
  const cardIdNum = Number(cardContextMenu.cardId);
  const ops = cardOps.forCard(cardContextMenu.cardId);
  const run = (op: (cardOps: BattlefieldCardOps) => void) => () => {
    if (ops) {
      op(ops);
    }
    closeSeatCardMenu();
  };
  const selectAll = () => {
    cardOps.selectAll();
    closeSeatCardMenu();
  };

  // "Token: …" items from the card's related list, plus "Token: Transform
  // into …" for a double-faced card and "All tokens" (desktop
  // addRelatedCardActions, card_menu.cpp:407-479). On another player's card
  // the token is still created by the local player, so it lands on the local
  // battlefield.
  const tokenItems: ContextMenuItem[] = card
    ? buildRelatedActionItems(
      {
        related: cardMetaByName.get(card.name)?.related ?? [],
        tokenMeta: tokenMetaByName,
        parentMeta: cardMetaByName.get(card.name),
        sourceCardId: Number.isFinite(cardIdNum) ? cardIdNum : undefined,
        parentName: card.name,
        annotate: annotateTokens,
      },
      cardCommands.createToken,
      menuShortcut('game.createRelatedTokens'),
      run((o) => o.createRelatedTokens()),
    )
    : [];
  const relatedViewItems = card ? relatedViewItemsFor(card.name) : [];

  const items = isSelf
    ? buildCardContextMenu({
      menuShortcut,
      faceDown: card?.faceDown ?? false,
      doesntUntap: card?.doesntUntap ?? false,
      isAttached: card?.attachTargetCardId != null && card.attachTargetCardId >= 0,
      onTapUntap: run((o) => o.toggleTapped()),
      onFlip: run((o) => o.toggleFaceDown()),
      onPeek: run((o) => o.peek()),
      onSkipUntapping: run((o) => o.toggleDoesntUntap()),
      onClone: run((o) => o.clone()),
      onSetAnnotation: run((o) => o.promptAnnotation()),
      onMoveToTop: run((o) => o.move({ zone: ZoneName.DECK })),
      onMoveToBottom: run((o) => o.move({ zone: ZoneName.DECK, reversed: true })),
      onMoveToXCardsFromTop: run((o) => o.promptMoveXFromTop()),
      onMoveToTable: run((o) => o.move({ zone: ZoneName.TABLE })),
      onMoveToHand: run((o) => o.move({ zone: ZoneName.HAND })),
      onMoveToGrave: run((o) => o.move({ zone: ZoneName.GRAVE })),
      onMoveToExile: run((o) => o.move({ zone: ZoneName.EXILE })),
      onIncP: run((o) => o.changePT(1, 0)),
      onDecP: run((o) => o.changePT(-1, 0)),
      onFlowP: run((o) => o.changePT(1, -1)),
      onIncT: run((o) => o.changePT(0, 1)),
      onDecT: run((o) => o.changePT(0, -1)),
      onFlowT: run((o) => o.changePT(-1, 1)),
      onIncPT: run((o) => o.changePT(1, 1)),
      onDecPT: run((o) => o.changePT(-1, -1)),
      onSetPT: run((o) => o.promptPT()),
      onResetPT: run((o) => o.resetPT()),
      onAttachToCard: run((o) => o.attach()),
      onUnattach: run((o) => o.unattach()),
      onDrawArrow: run((o) => o.drawArrow()),
      onReduceLifeByPower: run((o) => o.reduceLifeByPower()),
      onSelectAll: selectAll,
      onSelectRow: run((o) => o.selectRow()),
      onAddCardCounter: (counterId) => run((o) => o.stepCounter(counterId, 1))(),
      onSetCardCounter: (counterId) => run((o) => o.promptCounter(counterId))(),
      tokenItems,
      relatedViewItems,
    })
    : buildOpponentCardMenu({
      menuShortcut,
      onDrawArrow: run((o) => o.drawArrow()),
      onClone: run((o) => o.clone()),
      onReduceLifeByPower: run((o) => o.reduceLifeByPower()),
      onSelectAll: selectAll,
      onSelectRow: run((o) => o.selectRow()),
      tokenItems,
      relatedViewItems,
    });

  return (
    <ContextMenuPopup
      items={items}
      anchor={{ x: cardContextMenu.x, y: cardContextMenu.y }}
      label={card?.name ?? ''}
      onClose={closeSeatCardMenu}
    />
  );
}
