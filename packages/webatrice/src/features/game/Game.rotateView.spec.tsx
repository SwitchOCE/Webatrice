// "Rotate View Clockwise / Counterclockwise" (desktop TabGame::actRotateViewCW /
// CCW) from the game menu: the seats move around the table locally, and no
// request reaches the server.

import { fireEvent, screen, within } from '@testing-library/react';
import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import { buildSeatGameState } from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/catalog/lookup', () => {
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
});

function renderGame() {
  const webClient = createMockWebClient();
  const { container } = renderWithProviders(<Game />, {
    preloadedState: buildSeatGameState({
      localPlayerId: 1,
      seats: [
        { playerId: 1, deckCount: 40 },
        { playerId: 2, handCount: 7 },
        { playerId: 3, handCount: 7 },
      ],
    }),
    webClient,
  });
  // Each cell holds one seat's battlefield and places itself by grid row.
  const seatsTopToBottom = () =>
    [...container.querySelectorAll<HTMLElement>('.game__board-cell')]
      .sort((a, b) => Number(a.style.gridRow) - Number(b.style.gridRow))
      .map((cell) => Number(cell.querySelector('[data-battlefield-owner]')?.getAttribute('data-battlefield-owner')));
  const rotate = (id: 'rotateViewCW' | 'rotateViewCCW') => {
    fireEvent.click(screen.getByRole('button', { name: /GameMenu.button/ }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'GameMenu.button' }))
      .getByRole('menuitem', { name: `GameMenu.item.${id}` }));
  };
  return { webClient, seatsTopToBottom, rotate };
}

describe('Game view rotation', () => {
  it('moves the seats around the table and back, sending nothing', () => {
    const { webClient, seatsTopToBottom, rotate } = renderGame();
    // Ring [1,2,3] up the single column: the local seat at the bottom.
    expect(seatsTopToBottom()).toEqual([3, 2, 1]);

    rotate('rotateViewCW');
    expect(seatsTopToBottom()).toEqual([2, 1, 3]);

    rotate('rotateViewCCW');
    rotate('rotateViewCCW');
    expect(seatsTopToBottom()).toEqual([1, 3, 2]);

    expect(Object.values(webClient.request.game).some((fn) => vi.mocked(fn).mock.calls.length > 0)).toBe(false);
  });
});
