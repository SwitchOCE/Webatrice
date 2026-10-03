import { screen } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import { battlefieldEl, cardEl, pileEl, renderSeatCell, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';

vi.mock('../../../../../services/cards/cardCatalog', async () =>
  (await import('../../../__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  activePlayerId: 1,
  seats: [
    {
      playerId: 1,
      name: 'Alice',
      table: [makeCard({ id: 10, name: 'Bolt' })],
      stack: [makeCard({ id: 50, name: 'Shock' })],
      hand: [makeCard({ id: 30, name: 'Opt' })],
      deckCount: 9,
    },
    { playerId: 2, name: 'Bob', handCount: 2 },
  ],
};

/** The seat's root: the grid every region sits in. */
const seatRoot = () => battlefieldEl(1).closest<HTMLElement>('.rounded-lg')!;

describe('PlayerBoard', () => {
  it('composes the info column, the stack, the battlefield and the hand', () => {
    renderSeatCell(SPEC);
    expect(screen.getByLabelText(/^Alice — life total/)).toBeInTheDocument();
    expect(pileEl('Library')).toHaveAttribute('title', 'Library — 9');
    expect(cardEl(50, 'stack')).toBeInTheDocument();
    expect(cardEl(10, 'battlefield')).toBeInTheDocument();
    expect(cardEl(30, 'hand')).toBeInTheDocument();
  });

  it('puts the hand row below the play area on the local seat, and glows on its turn', () => {
    renderSeatCell(SPEC);
    expect(seatRoot().style.gridTemplateRows).toMatch(/^1fr /);
    expect(seatRoot()).toHaveClass('border-accent');
  });

  it('puts the hand row on top of a mirrored seat', () => {
    renderSeatCell(SPEC, 2);
    const root = battlefieldEl(2).closest<HTMLElement>('.rounded-lg')!;
    expect(root.style.gridTemplateRows).toMatch(/ 1fr$/);
    expect(root).toHaveClass('border-border-subtle');
  });
});
