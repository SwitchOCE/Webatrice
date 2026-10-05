import { ZoneName } from '@cockatrice/sockatrice';
import { usePreference } from '@app/hooks';

import type { SeatMoveDestination } from '../../ui/PlayerBoard/playerBoard.types';
import { usePlayerSeatContext } from '../../ui/PlayerBoard/PlayerSeatContext';
import { buildRelatedTokenItems, buildTransformItems } from '../CardContextMenu/relatedCardActions';
import { ContextMenuPopup, type ContextMenuItem } from '../ContextMenu/ContextMenu';

/**
 * Stack-card context menu — ports Cockatrice's
 * `CardMenu::createStackMenu` (card_menu.cpp:201-227). Own-stack
 * gets the full item set (Play / Play Face Down / Clone /
 * Move to / Attach / Draw arrow / Select All); opponent-stack
 * gets the trimmed view-only branch (Draw arrow / Clone / Select
 * All). Wire cannot fire moves for opponent-owned stack cards
 * (server rejects), so those items are omitted rather than shown
 * disabled.
 */
export default function StackCardMenu() {
  const {
    cardCommands,
    cardMetaByName,
    closeSeatCardMenu,
    isSelf,
    relatedViewItemsFor,
    selection,
    startAttach,
    startDrawArrow,
    setSelection,
    menuShortcut,
    stackCardMenu,
    stackDisplayList,
    tokenMetaByName,
    zoneCommands,
  } = usePlayerSeatContext();
  // Desktop's "Annotate card text on tokens".
  const annotateTokens = usePreference('annotateTokens');

  return (
    <>
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
          const opponentItems: ContextMenuItem[] = [
            {
              label: 'Draw arrow...',
              ...menuShortcut('game.drawArrow'),
              onClick: () => {
                if (numeric && card) {
                  startDrawArrow({
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
              ...menuShortcut('game.cloneCard'),
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
              ...menuShortcut('game.selectAllBattlefield'),
              onClick: () => {
                const ids = new Set(stackDisplayList.map((sc) => sc.id));
                if (ids.size > 0) {
                  setSelection({ zone: 'stack', ids });
                }
                close();
              },
            },
            ...(card ? relatedViewItemsFor(card.name) : []),
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
                  annotateTokens,
                ),
                ...buildTransformItems(
                  cardMetaByName.get(card.name),
                  Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                  card.name,
                  cardCommands.createToken,
                  annotateTokens,
                ),
              ];
              return tokens.length > 0
                ? [{ divider: true } as ContextMenuItem, ...tokens]
                : [];
            })(),
          ];
          return (
            <ContextMenuPopup
              items={opponentItems}
              anchor={{ x: stackCardMenu.x, y: stackCardMenu.y }}
              label={card?.name ?? ''}
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
        const items: ContextMenuItem[] = [
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
            ...menuShortcut('game.cloneCard'),
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
            ...menuShortcut('game.attachCard'),
            onClick: () => {
              if (numeric && card) {
                const extras = targets
                  .filter((sc) => Number(sc.id) !== cardIdNum)
                  .map((sc) => Number(sc.id))
                  .filter((n) => Number.isFinite(n));
                startAttach([cardIdNum, ...extras], card.name, ZoneName.STACK);
              }
              close();
            },
          },
          {
            label: 'Draw arrow...',
            ...menuShortcut('game.drawArrow'),
            onClick: () => {
              if (numeric && card) {
                startDrawArrow({
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
            ...menuShortcut('game.selectAllBattlefield'),
            onClick: () => {
              const ids = new Set(stackDisplayList.map((sc) => sc.id));
              if (ids.size > 0) {
                setSelection({ zone: 'stack', ids });
              }
              close();
            },
          },
          ...(card ? relatedViewItemsFor(card.name) : []),
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
                annotateTokens,
              ),
              ...buildTransformItems(
                cardMetaByName.get(card.name),
                Number.isFinite(cardIdNum) ? cardIdNum : undefined,
                card.name,
                cardCommands.createToken,
                annotateTokens,
              ),
            ];
            return tokens.length > 0
              ? [{ divider: true } as ContextMenuItem, ...tokens]
              : [];
          })(),
        ];
        return (
          <ContextMenuPopup
            items={items}
            anchor={{ x: stackCardMenu.x, y: stackCardMenu.y }}
            label={card?.name ?? ''}
            onClose={closeSeatCardMenu}
          />
        );
      })()}
    </>
  );
}
