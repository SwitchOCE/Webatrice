import { act, fireEvent, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import { games } from '@cockatrice/datatrice';
import {
  Command_MoveCard_ext,
  Event_MoveCard_ext,
  Event_MoveCardSchema,
  ServerInfo_CardSchema,
} from '@cockatrice/sockatrice/generated';
import { Game } from '@app/features/game';
import { store, connectRaw } from '../../helpers/setup';
import { findAllGameCommands } from '../../helpers/command-capture';
import { buildGameEventMessage, deliverMessage } from '../../helpers/protobuf-builders';
import { renderFeatureScreen } from '../helpers';
import { buildEventGameJoined, buildEventGameStateChanged, registerGameBoardHooks } from './helpers';

registerGameBoardHooks();

const handSelector = '[data-card][data-zone="hand"]';

async function renderHand() {
  connectRaw();
  renderFeatureScreen(<Game />);
  const data = buildEventGameStateChanged([1, 2], 1);
  const hand = data.playerList[0].zoneList.find((zone) => zone.name === 'hand')!;
  hand.cardList = [101, 102, 103].map((id) => create(ServerInfo_CardSchema, {
    id, name: `Card ${id}`,
  }));
  hand.cardCount = hand.cardList.length;
  act(() => {
    store.dispatch(games.Actions.gameJoined({
      data: buildEventGameJoined({ gameId: 42, localPlayerId: 1, hostId: 1 }),
    }));
    store.dispatch(games.Actions.gameStateChanged({ gameId: 42, data }));
  });
  await waitFor(() => expect(document.querySelectorAll(handSelector)).toHaveLength(3));
  const cards = Array.from(document.querySelectorAll<HTMLElement>(handSelector));
  // jsdom has no layout. Give the rendered hand and its cards concrete bounds
  // so the production pointer hit-test computes the insertion index.
  cards.forEach((card, index) => {
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(100 + index * 100, 500, 80, 120));
  });
  vi.spyOn(cards[0].parentElement!.parentElement!, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(90, 500, 320, 120));
  return cards;
}

describe('Hand drag reorder', () => {
  it.each([
    { source: 0, dropX: 390, index: 2, expected: ['102', '103', '101'] },
    { source: 2, dropX: 100, index: 0, expected: ['103', '101', '102'] },
    { source: 0, dropX: 280, index: 1, expected: ['102', '101', '103'] },
  ])('moves card $source to ordinal $index', async ({ source, dropX, index, expected }) => {
    const cards = await renderHand();
    fireEvent.pointerDown(cards[source], { button: 0, clientX: 140 + source * 100, clientY: 550 });
    fireEvent.pointerMove(window, { clientX: dropX, clientY: 550 });
    fireEvent.pointerUp(window, { clientX: dropX, clientY: 550 });

    const commands = findAllGameCommands(Command_MoveCard_ext);
    expect(commands).toHaveLength(1);
    expect(commands[0].gameId).toBe(42);
    expect(commands[0].value).toMatchObject({
      startPlayerId: 1, startZone: 'hand', targetPlayerId: 1, targetZone: 'hand',
      cardsToMove: { card: [{ cardId: 101 + source }] }, x: index, y: 0,
    });

    // Servatrice omits target_zone for a same-zone move.
    act(() => deliverMessage(buildGameEventMessage({
      gameId: 42, playerId: 1, ext: Event_MoveCard_ext,
      value: create(Event_MoveCardSchema, {
        startPlayerId: 1, startZone: 'hand', targetPlayerId: 1,
        cardId: 101 + source, newCardId: 101 + source, position: -1, x: index, y: 0,
      }),
    })));
    await waitFor(() => expect(
      Array.from(document.querySelectorAll<HTMLElement>(handSelector), (card) => card.dataset.cardId),
    ).toEqual(expected));
    expect(games.Selectors.getZone(store.getState(), 42, 1, 'hand')?.cardCount).toBe(3);
  });
});
