import { fireEvent, screen } from '@testing-library/react';

import { LIFE_COUNTER_ID, MANA_COUNTER_IDS, renderSeatCell, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';

vi.mock('../../../../../services/cards/cardCatalog', async () =>
  (await import('../../../__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, name: 'Alice', life: 18 },
    { playerId: 2, name: 'Bob' },
  ],
};

const lifePill = (name: string) => screen.getByLabelText(new RegExp(`^${name} — life total`));

describe('PlayerInfoPanel', () => {
  it('shows the player, the life total and the seven mana pool counters', () => {
    renderSeatCell(SPEC);
    expect(lifePill('Alice')).toHaveTextContent('Alice18');
    expect(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Other'].map((label) => screen.getByTitle(label).textContent))
      .toEqual(['0', '0', '0', '0', '0', '0', '0']);
    expect(lifePill('Alice')).toHaveAttribute('data-arrow-target-player-id', '1');
  });

  it('lets the owner click the life total up and right-click it down', () => {
    const { game } = renderSeatCell(SPEC);
    fireEvent.click(lifePill('Alice'));
    fireEvent.contextMenu(lifePill('Alice'));
    expect(vi.mocked(game.incCounter).mock.calls.map(([, params]) => params)).toEqual([
      { counterId: LIFE_COUNTER_ID, delta: 1 },
      { counterId: LIFE_COUNTER_ID, delta: -1 },
    ]);
  });

  it('lets the owner add and remove mana with a click and a right-click', () => {
    const { game } = renderSeatCell(SPEC);
    fireEvent.click(screen.getByTitle('Green'));
    fireEvent.contextMenu(screen.getByTitle('Other'));
    expect(vi.mocked(game.incCounter).mock.calls.map(([, params]) => params)).toEqual([
      { counterId: MANA_COUNTER_IDS.g, delta: 1 },
      { counterId: MANA_COUNTER_IDS.storm, delta: -1 },
    ]);
  });

  it('is read-only on another player\'s seat', () => {
    const { game } = renderSeatCell(SPEC, 2);
    fireEvent.click(lifePill('Bob'));
    fireEvent.click(screen.getByTitle('Green'));
    expect(game.incCounter).not.toHaveBeenCalled();
    expect(lifePill('Bob')).not.toHaveAttribute('role');
  });
});
