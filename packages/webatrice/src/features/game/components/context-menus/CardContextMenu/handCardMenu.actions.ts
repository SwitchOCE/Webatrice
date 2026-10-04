// What the hand and zone-view card menu does: which cards an item acts on,
// where Play sends them, and which seat port each item calls. The seat passes
// its state and ports in and splices the result into CardMenuPopup, so the
// handler logic lives here and not in the seat's JSX.

import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import type { ActionId } from '@app/feature-widgets/shortcuts';

import type { SeatCardMenuState } from '../../../hooks/dialogs/gameDialogs.types';
import type { SeatSelection } from '../../../hooks/useSeatSelection';
import { makeCardKey, parseCardKey } from '../../../utils/CardRegistry/CardRegistryContext';
import {
  legacyTableRowFromTypeLine,
  playedCardFields,
  tableRowToGridY,
  type PlayedCardMeta,
} from '../../battlefield/Battlefield/cardPlacement';
import type {
  PlayerCardViewModel,
  SeatMoveCard,
  SeatMoveDestination,
} from '../../ui/PlayerBoard/playerBoard.types';
import { moveSelectedCards } from '../../ui/PlayerBoard/selectionMoves';
import type { CardMenuItem } from './cardContextMenu.model';
import { buildHandOrZoneCardMenu } from './handCardMenu.model';

/** What playing a card needs from its catalog entry. */
export interface PlayCardMeta extends PlayedCardMeta {
  typeLine: string;
}

/**
 * The Command_MoveCard a play sends; desktop PlayerActions::playCard
 * (player_actions.cpp:51-98). The hand menu's Play sends only row 3 to the
 * stack. With `playToStack`, everything but a land goes there: the HandZone
 * double-click passes the "Play all nonlands onto the stack" preference as
 * `playToStack`.
 * From the stack (`fromStack`), an instant or sorcery goes to the graveyard
 * and anything else to the battlefield. Face down always lands in row 2. A
 * card that reaches the battlefield face up carries its printed P/T, and
 * comes in tapped when cards.xml says cipt.
 */
export function playCardMove(
  cardId: number,
  meta: PlayCardMeta | undefined,
  { faceDown = false, playToStack = false, fromStack = false }: {
    faceDown?: boolean;
    playToStack?: boolean;
    fromStack?: boolean;
  } = {},
): { card: SeatMoveCard; to: SeatMoveDestination } {
  const tableRow = legacyTableRowFromTypeLine(meta?.typeLine ?? '');
  if (!faceDown && fromStack && tableRow === 3) {
    return { card: cardId, to: { zone: ZoneName.GRAVE, index: 'end' } };
  }
  if (!faceDown && !fromStack && (playToStack ? tableRow !== 0 : tableRow === 3)) {
    return { card: cardId, to: { zone: ZoneName.STACK, index: 'end' } };
  }
  const fields = playedCardFields(meta, faceDown);
  const card: SeatMoveCard = faceDown
    ? { id: cardId, faceDown: true }
    : fields.pt || fields.tapped ? { id: cardId, ...fields } : cardId;
  return { card, to: { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(faceDown ? 2 : tableRow) } };
}

/**
 * The moves that play these cards, one Command_MoveCard each (desktop
 * actPlay / actPlayFacedown over the selected cards).
 */
export function playCardMoves(
  cards: readonly { id: string; name: string }[],
  cardMeta: (name: string) => PlayCardMeta | undefined,
  faceDown: boolean,
): { card: SeatMoveCard; to: SeatMoveDestination }[] {
  return cards.map((c) => playCardMove(Number(c.id), cardMeta(c.name), { faceDown }));
}

/**
 * The selected cards of one of the seat's hidden zones that "Reveal selected
 * cards to all players" sends: the hand selection, or the selected cards of
 * one open library / sideboard view. Null when the selection is elsewhere.
 */
export function selectedHiddenZoneCards(
  seatId: number,
  handSelection: SeatSelection | null,
  selectedCardKeys: ReadonlySet<string>,
): { zone: ZoneNameValue; cardIds: number[] } | null {
  if (handSelection?.zone === 'hand') {
    const cardIds = Array.from(handSelection.ids, Number).filter((n) => Number.isFinite(n));
    return cardIds.length > 0 ? { zone: ZoneName.HAND, cardIds } : null;
  }
  const picked = Array.from(selectedCardKeys, (key) => parseCardKey(key));
  const zone = picked[0]?.zone;
  if (
    picked.length === 0 ||
    (zone !== ZoneName.DECK && zone !== ZoneName.SIDEBOARD) ||
    !picked.every((p) => p?.playerId === seatId && p.zone === zone)
  ) {
    return null;
  }
  return { zone, cardIds: picked.map((p) => p!.cardId) };
}

export interface HandOrZoneCardMenuDeps {
  /** The seat's open card menu; only a hand or zone-view one renders here. */
  menu: SeatCardMenuState | null;
  /** The player whose cards the menu shows (card keys use it). */
  ownerId: number;
  shortcutHints: Record<ActionId, string>;
  canModify: boolean;
  revealTargets: readonly { playerId: number; name: string }[];
  handCards: readonly PlayerCardViewModel[];
  libraryViewCards: readonly PlayerCardViewModel[];
  sideboardCards: readonly PlayerCardViewModel[];
  handSelection: SeatSelection | null;
  setHandSelection: (next: SeatSelection | null) => void;
  /** The game selection, which a zone view's cards live in. */
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: (next: ReadonlySet<string>) => void;
  cardMeta: (name: string) => PlayCardMeta | undefined;
  /** Library size for "X cards from the top of library...". */
  deckSize: number;
  moveCards?: (from: ZoneNameValue, cards: readonly SeatMoveCard[], to: SeatMoveDestination) => void;
  revealCards?: (zone: ZoneNameValue, targetPlayerId: number, cardIds: readonly number[]) => void;
  cloneCard?: (source: {
    name: string;
    providerId: string;
    color: string;
    pt: string;
    annotation: string;
    y: number;
  }) => void;
  promptMoveXFromTop: (args: { cardIds: number[]; cardName: string; deckSize: number; fromZone: ZoneNameValue }) => void;
  startArrow: (source: { sourceCardId: number; sourceCardName: string; sourceZone: ZoneNameValue }) => void;
  relatedViewItems: (cardName: string) => CardMenuItem[];
  tokenItems: (cardName: string) => CardMenuItem[];
  close: () => void;
}

/** What CardMenuPopup renders, without its onClose. */
export interface CardMenuPopupModel {
  items: CardMenuItem[];
  anchor: { x: number; y: number };
  disabled: boolean;
}

/**
 * Desktop CardMenu::createHandOrCustomZoneMenu (card_menu.cpp:296-342) with
 * its actions wired. Actions apply to the selection when the clicked card is
 * part of it (desktop's selectedCards), else to the clicked card. Null when no
 * hand or zone-view menu is open.
 */
export function resolveHandOrZoneCardMenu(deps: HandOrZoneCardMenuDeps): CardMenuPopupModel | null {
  const { menu } = deps;
  if (menu?.kind !== 'hand' && menu?.kind !== 'zoneView') {
    return null;
  }
  const zoneView = menu.kind === 'zoneView' ? menu : null;
  const zone = (zoneView?.zone ?? ZoneName.HAND) as ZoneNameValue;
  const zoneCards = !zoneView
    ? deps.handCards
    : zone === ZoneName.SIDEBOARD ? deps.sideboardCards : deps.libraryViewCards;
  const viewKey = (id: string) => makeCardKey(deps.ownerId, zone, Number(id));

  let targetIdStrings: string[];
  if (zoneView) {
    const selectedInView = zoneView.viewCardIds.filter((id) => deps.selectedCardKeys.has(viewKey(id)));
    targetIdStrings = selectedInView.includes(menu.cardId) ? selectedInView : [menu.cardId];
  } else {
    targetIdStrings = deps.handSelection?.zone === 'hand' && deps.handSelection.ids.has(menu.cardId)
      ? Array.from(deps.handSelection.ids)
      : [menu.cardId];
  }
  const targets = targetIdStrings
    .map((id) => zoneCards.find((c) => c.id === id))
    .filter((c): c is PlayerCardViewModel => c != null && Number.isFinite(Number(c.id)));
  const targetIds = targets.map((c) => Number(c.id));
  const cardName = zoneCards.find((c) => c.id === menu.cardId)?.name ?? zoneView?.cardName ?? '';
  const cardIdNum = Number(menu.cardId);
  const numeric = Number.isFinite(cardIdNum);

  const run = (fn: () => void) => () => {
    fn();
    deps.close();
  };
  const moveTargets = (to: SeatMoveDestination) => {
    if (deps.moveCards) {
      moveSelectedCards(deps.moveCards, zone, targets, to, deps.cardMeta);
    }
  };
  const selectInView = (ids: readonly string[]) => deps.setSelectedCardKeys(new Set(ids.map(viewKey)));
  // One Command_MoveCard per card, as desktop's playCard sends.
  const play = (faceDown: boolean) => run(() => {
    for (const { card, to } of playCardMoves(targets, deps.cardMeta, faceDown)) {
      deps.moveCards?.(zone, [card], to);
    }
  });

  const items = buildHandOrZoneCardMenu({
    shortcutHints: deps.shortcutHints,
    source: zoneView ? 'zoneView' : 'hand',
    canModify: deps.canModify,
    revealTargets: deps.revealTargets,
    onPlay: play(false),
    onPlayFaceDown: play(true),
    onReveal: (targetPlayerId) => run(() => {
      if (targetIds.length > 0) {
        deps.revealCards?.(zone, targetPlayerId, targetIds);
      }
    })(),
    onClone: run(() => {
      for (const c of targets) {
        deps.cloneCard?.({ name: c.name, providerId: c.scryfallId, color: '', pt: '', annotation: '', y: 0 });
      }
    }),
    onMove: (target) => run(() => {
      switch (target) {
        case 'libraryTop':
          return moveTargets({ zone: ZoneName.DECK });
        case 'libraryBottom':
          return moveTargets({ zone: ZoneName.DECK, reversed: true });
        case 'libraryXFromTop':
          // Desktop actMoveCardXCardsFromTop moves the whole selection in one
          // Command_MoveCard (player_actions.cpp:1229-1252).
          if (targetIds.length > 0) {
            deps.promptMoveXFromTop({ cardIds: targetIds, cardName, deckSize: deps.deckSize, fromZone: zone });
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
        deps.startArrow({ sourceCardId: cardIdNum, sourceCardName: cardName, sourceZone: zone });
      }
    }),
    onSelectAll: run(() => {
      if (zoneView) {
        selectInView(zoneView.viewCardIds);
      } else if (deps.handCards.length > 0) {
        deps.setHandSelection({ zone: 'hand', ids: new Set(deps.handCards.map((c) => c.id)) });
      }
    }),
    onSelectColumn: zoneView ? run(() => selectInView(zoneView.columnCardIds)) : undefined,
    relatedViewItems: deps.relatedViewItems(cardName),
    tokenItems: deps.tokenItems(cardName),
  });
  return { items, anchor: { x: menu.x, y: menu.y }, disabled: !numeric };
}
