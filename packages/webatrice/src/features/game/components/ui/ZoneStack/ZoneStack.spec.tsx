import { fireEvent } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import {
  chooseMenuPath,
  menuLabels,
  openContextMenu,
  openMenus,
  pileEl,
  renderSeatCell,
  type SeatGameSpec,
} from '../../../__test-utils__/seatFixtures';

vi.mock('../../../../../services/cards/catalog/lookup', async () =>
  (await import('../../../__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, deckCount: 40, grave: [makeCard({ id: 40, name: 'Duress' }), makeCard({ id: 41, name: 'Opt' })], exile: [] },
    { playerId: 2, deckCount: 33, grave: [] },
  ],
};

describe('ZoneStack', () => {
  it('draws the library, graveyard and exile piles with their counts and top card', () => {
    renderSeatCell(SPEC);
    expect(pileEl('Library')).toHaveAttribute('title', 'Library — 40');
    expect(pileEl('Graveyard')).toHaveAttribute('title', 'Graveyard — 2 (top: Opt)');
    expect(pileEl('Exile')).toHaveAttribute('title', 'Exile — 0');
  });

  it('gives the owner the library menu, and its first item draws', () => {
    const { game } = renderSeatCell(SPEC);
    expect(menuLabels(openContextMenu(pileEl('Library'))).slice(0, 3)).toEqual(['Draw card', 'Draw cards...', 'Undo last draw']);
    chooseMenuPath('Draw card');
    expect(game.drawCards).toHaveBeenCalledWith(1, { number: 1 });
  });

  it('gives the owner the graveyard menu and another viewer only its view', () => {
    renderSeatCell(SPEC);
    expect(menuLabels(openContextMenu(pileEl('Graveyard')))).toEqual(
      expect.arrayContaining(['View graveyard', 'Reveal random card to...', 'Move graveyard to...']),
    );
  });

  it('opens no menu on another player\'s library, and only views on their piles', () => {
    renderSeatCell(SPEC, 2);
    fireEvent.contextMenu(pileEl('Library'));
    expect(openMenus()).toEqual([]);
    expect(menuLabels(openContextMenu(pileEl('Exile')))).toEqual(['View exile (disabled)']);
  });

  it('draws a pile\'s top card from its printing, else from its exact name', () => {
    renderSeatCell({
      localPlayerId: 1,
      seats: [{
        playerId: 1,
        deckCount: 40,
        grave: [makeCard({ id: 40, name: 'Rhino, Warrior Token', providerId: '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b' })],
        exile: [makeCard({ id: 41, name: 'Rhino, Warrior Token' })],
      }],
    });
    expect(pileEl('Graveyard').querySelector('img')).toHaveAttribute(
      'src',
      'https://api.scryfall.com/cards/0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b?format=image&version=large',
    );
    expect(pileEl('Exile').querySelector('img')).toHaveAttribute(
      'src',
      'https://api.scryfall.com/cards/named?exact=Rhino%2C%20Warrior%20Token&format=image&version=large',
    );
  });
});
