import { fireEvent } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { CardAttribute } from '@cockatrice/sockatrice/generated';
import { makeCard } from '@cockatrice/datatrice/testing';

import {
  battlefieldEl,
  cardEl,
  menuLabels,
  openContextMenu,
  renderSeatCell,
  type SeatGameSpec,
} from '../../../__test-utils__/seatFixtures';

vi.mock('../../../../../services/cards/cardCatalog', async () =>
  (await import('../../../__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const BOLT = makeCard({ id: 10, name: 'Bolt', x: 3, y: 1 });
const OGRE = makeCard({ id: 11, name: 'Ogre', x: 0, y: 0, tapped: true });
const BEAR = makeCard({ id: 20, name: 'Bear', x: 0, y: 0 });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, table: [BOLT, OGRE] },
    { playerId: 2, table: [BEAR] },
  ],
};

describe('Battlefield', () => {
  it('renders the owner\'s board with each card addressable on the wire and tapped cards turned', () => {
    renderSeatCell(SPEC);
    expect(battlefieldEl(1)).toBeInTheDocument();
    expect(cardEl(BOLT.id, 'battlefield')).toHaveAttribute('data-card-owner', '1');
    expect(cardEl(BOLT.id, 'battlefield')).toHaveAttribute('data-card-zone', ZoneName.TABLE);
    expect(cardEl(OGRE.id, 'battlefield').style.transform).toBe('rotate(90deg)');
    expect(cardEl(BOLT.id, 'battlefield').style.transform).toBe('');
  });

  it('gives the owner desktop\'s player menu on the board, and another viewer the pile views', () => {
    renderSeatCell(SPEC);
    expect(menuLabels(openContextMenu(battlefieldEl(1))).slice(0, 5)).toEqual(['Hand', 'Library', 'Graveyard', 'Exile', 'Sideboard']);
  });

  it('gives another viewer only the graveyard and exile views and Tally on that board', () => {
    renderSeatCell(SPEC, 2);
    expect(menuLabels(openContextMenu(battlefieldEl(2)))).toEqual(['Graveyard', 'Exile', 'Tally']);
  });

  it('opens the seat\'s card menu on a card instead of the board menu', () => {
    const openSeatCardMenu = vi.fn();
    renderSeatCell(SPEC, 2, { gameDialogs: { openSeatCardMenu } });
    fireEvent.contextMenu(cardEl(BEAR.id, 'battlefield'), { clientX: 1, clientY: 2 });
    expect(openSeatCardMenu).toHaveBeenCalledWith({ kind: 'battlefield', playerId: 2, cardId: '20', x: 1, y: 2 });
  });

  it('taps and untaps an own card on double-click', () => {
    const { game } = renderSeatCell(SPEC);
    fireEvent.doubleClick(cardEl(OGRE.id, 'battlefield'));
    expect(vi.mocked(game.setCardAttr).mock.calls.map(([, params]) => params)).toEqual([
      { zone: ZoneName.TABLE, cardId: OGRE.id, attribute: CardAttribute.AttrTapped, attrValue: '0' },
    ]);
  });

  it('does not tap another player\'s card', () => {
    const { game } = renderSeatCell(SPEC, 2);
    fireEvent.doubleClick(cardEl(BEAR.id, 'battlefield'));
    expect(game.setCardAttr).not.toHaveBeenCalled();
  });
});
