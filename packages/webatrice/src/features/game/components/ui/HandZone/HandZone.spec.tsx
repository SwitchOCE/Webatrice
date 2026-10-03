import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { lookupCard } from '../../../../../services/cards/catalog/lookup';
import { cardEl, menuLabels, openContextMenu, renderSeatCell, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import { CARD_BACK_URL } from '../SeatCard/cardSize';

vi.mock('../../../../../services/cards/catalog/lookup', async () =>
  (await import('../../../__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const FOREST = makeCard({ id: 30, name: 'Forest' });
const SHOCK = makeCard({ id: 31, name: 'Shock' });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, hand: [FOREST, SHOCK] },
    { playerId: 2, handCount: 3 },
  ],
};

const found = (name: string, typeLine: string) =>
  ({ found: true, source: 'scryfall', name, typeLine, printings: [] }) as Awaited<ReturnType<typeof lookupCard>>;

const handButton = () => screen.getByTitle(/^Hand — /);
// The hand row is the element the hand button sits in.
const handBacks = () => handButton().parentElement!.querySelectorAll(`img[src="${CARD_BACK_URL}"]`);

describe('HandZone', () => {
  it('shows the owner their hand faces and its count', () => {
    renderSeatCell(SPEC);
    expect(handButton()).toHaveAttribute('title', 'Hand — 2 cards');
    expect(cardEl(FOREST.id, 'hand')).toBeInTheDocument();
    expect(cardEl(SHOCK.id, 'hand')).toBeInTheDocument();
  });

  it('shows another player\'s hand as card backs for the server\'s count, with no menu', () => {
    renderSeatCell(SPEC, 2);
    expect(handButton()).toHaveAttribute('title', 'Hand — 3 cards');
    expect(handButton()).toBeDisabled();
    expect(document.querySelectorAll('[data-card][data-zone="hand"]')).toHaveLength(0);
    expect(handBacks()).toHaveLength(3);
  });

  it('opens the hand menu from the hand button', () => {
    renderSeatCell(SPEC);
    expect(menuLabels(openContextMenu(handButton())).slice(0, 2)).toEqual(['View hand', 'Sort hand by...']);
  });

  it('plays a land straight to the battlefield and anything else onto the stack on double-click', async () => {
    const { game } = renderSeatCell(SPEC);
    vi.mocked(lookupCard).mockResolvedValueOnce(found('Forest', 'Basic Land — Forest'));
    fireEvent.doubleClick(cardEl(FOREST.id, 'hand'));
    await waitFor(() => expect(game.moveCard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({ startZone: ZoneName.HAND, targetZone: ZoneName.TABLE });

    vi.mocked(lookupCard).mockResolvedValueOnce(found('Shock', 'Instant'));
    fireEvent.doubleClick(cardEl(SHOCK.id, 'hand'));
    await waitFor(() => expect(game.moveCard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(game.moveCard).mock.calls[1][1]).toMatchObject({ startZone: ZoneName.HAND, targetZone: ZoneName.STACK });
  });
});
