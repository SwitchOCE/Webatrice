import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { getSettings, settingsStore } from '../../../../../hooks/useSettings';
import { lookupCard } from '../../../../../services/cards/cardCatalog';
import type { Preferences } from '../../../../../types';
import { cardEl, menuLabels, openContextMenu, renderSeatCell, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import { CARD_BACK_URL } from '../SeatCard/cardSize';

vi.mock('../../../../../services/cards/cardCatalog', async () =>
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

const setPreferences = async (patch: Partial<Preferences>) => {
  const settings = await getSettings();
  await act(async () => {
    settingsStore.setValue(Object.assign(settings, patch));
  });
};

const handButton = () => screen.getByTitle(/^Hand — /);
// The hand row is the element the hand button sits in.
const handBacks = () => handButton().parentElement!.querySelectorAll(`img[src="${CARD_BACK_URL}"]`);

describe('HandZone', () => {
  afterEach(() => {
    settingsStore.reset();
  });

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

  it('centres the hand row by default and starts it at the left when left justified', async () => {
    renderSeatCell(SPEC);
    const row = () => cardEl(FOREST.id, 'hand').parentElement!;
    expect(row()).toHaveClass('m-auto');
    expect(row().style.marginLeft).toBe('');

    await setPreferences({ leftJustifiedHand: true });

    expect(row()).not.toHaveClass('m-auto');
    expect(row()).toHaveClass('mr-auto');
    expect(row().style.marginLeft).toBe('calc(var(--card-width, 72px) * 1.4)');
  });

  describe('vertical hand', () => {
    it('puts the hand in a column beside the info column, every card still playable', async () => {
      const { game } = renderSeatCell(SPEC);
      await setPreferences({ horizontalHand: false });

      const column = screen.getByTestId('hand-zone-1').parentElement!;
      expect(column.style.gridColumn).toBe('2');
      expect(column.style.gridRow).toBe('1');
      expect(column).toContainElement(handButton());
      expect(column).toContainElement(cardEl(FOREST.id, 'hand'));
      expect(column).toContainElement(cardEl(SHOCK.id, 'hand'));

      vi.mocked(lookupCard).mockResolvedValueOnce(found('Shock', 'Instant'));
      fireEvent.doubleClick(cardEl(SHOCK.id, 'hand'));
      await waitFor(() => expect(game.moveCard).toHaveBeenCalledTimes(1));
      expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({ startZone: ZoneName.HAND, targetZone: ZoneName.STACK });
    });

    it('brings the hovered card to the front', async () => {
      renderSeatCell(SPEC);
      await setPreferences({ horizontalHand: false });
      const slot = (id: number) => cardEl(id, 'hand').parentElement!;
      expect(slot(FOREST.id).style.zIndex).toBe('0');
      expect(slot(SHOCK.id).style.zIndex).toBe('1');

      fireEvent.mouseEnter(slot(FOREST.id));
      expect(slot(FOREST.id).style.zIndex).toBe('2');

      fireEvent.mouseLeave(slot(FOREST.id));
      expect(slot(FOREST.id).style.zIndex).toBe('0');
    });

    it('shows another player\'s hand as a column of card backs', async () => {
      renderSeatCell(SPEC, 2);
      await setPreferences({ horizontalHand: false });
      expect(screen.getByTestId('hand-zone-2').querySelectorAll(`img[src="${CARD_BACK_URL}"]`)).toHaveLength(3);
    });
  });
});
