// The tally overlay end to end through <Game />: the player menu's Tally
// submenu picks the tally, and the overlay shows it over the selection.
import { act, renderHook, screen, within } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../../../__test-utils__';
import {
  battlefieldEl,
  buildSeatGameState,
  cardEl,
  chooseMenuPath,
  openContextMenu,
} from '../../__test-utils__/seatFixtures';
import Game from '../../Game';
import { useTallyType } from '../../hooks/useTallyType';

vi.mock('../../../../hooks/useSettings');

vi.mock('../../../../services/cards/cardCatalog', () => {
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

const OGRE = makeCard({ id: 10, name: 'Ogre', x: 0, y: 0, pt: '3/3' });
const ELF = makeCard({ id: 11, name: 'Elf', x: 3, y: 0, pt: '1/1' });

function renderGame() {
  const { store } = renderWithProviders(<Game />, {
    preloadedState: buildSeatGameState({
      localPlayerId: 1,
      seats: [{ playerId: 1, table: [OGRE, ELF] }, { playerId: 2 }],
    }),
    webClient: createMockWebClient(),
  });
  return store;
}

function tally() {
  return screen.queryByRole('status', { name: 'TallyOverlay.tally' });
}

beforeEach(() => {
  // The choice is a per-user preference; start every test at None.
  const { result } = renderHook(() => useTallyType());
  act(() => result.current[1]('none'));
});

describe('TallyOverlay', () => {
  it('stays hidden until a tally is chosen, then totals the selection', async () => {
    renderGame();
    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath('Select All');
    expect(tally()).not.toBeInTheDocument();

    openContextMenu(battlefieldEl(1));
    chooseMenuPath('Tally', 'Total Power');
    await act(async () => {});

    expect(within(tally()!).getByText('Total Power')).toBeInTheDocument();
    expect(within(tally()!).getByText('4')).toBeInTheDocument();
  });

  it('is chosen from an opponent\'s menu too, and hides again with nothing selected', async () => {
    renderGame();
    openContextMenu(battlefieldEl(2));
    chooseMenuPath('Tally', 'Total Toughness');
    await act(async () => {});
    expect(tally()).not.toBeInTheDocument();

    openContextMenu(cardEl(ELF.id, 'battlefield'));
    chooseMenuPath('Select All');
    await act(async () => {});
    expect(within(tally()!).getByText('Total Toughness')).toBeInTheDocument();
    expect(within(tally()!).getByText('4')).toBeInTheDocument();
  });

  it('shows the selection count from two selected cards, with no tally chosen', () => {
    renderGame();
    expect(screen.queryByRole('status', { name: 'TallyOverlay.selectedCount' })).not.toBeInTheDocument();

    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath('Select All');

    expect(screen.getByRole('status', { name: 'TallyOverlay.selectedCount' })).toHaveTextContent('2');
    // Not announced on every selection change; the tally region is.
    expect(screen.getByRole('status', { name: 'TallyOverlay.selectedCount' })).toHaveAttribute('aria-live', 'off');
    expect(tally()).not.toBeInTheDocument();
  });
});
