import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { PREFERENCE_DEFAULTS } from '@app/types';

import { usePreferences } from '../../../../../hooks/useSettings';
import { lookupCard } from '../../../../../services/cards/catalog/lookup';
import type { Preferences } from '../../../../../types';
import {
  buildSeatGameState, cardEl, chooseMenuPath, menuLabels, openContextMenu, renderSeatCell, type SeatGameSpec,
} from '../../../__test-utils__/seatFixtures';
import { createMockWebClient, renderWithProviders } from '../../../../../__test-utils__';
import Game from '../../../Game';
import { CARD_BACK_URL } from '../SeatCard/cardSize';

vi.mock('../../../../../hooks/useSettings');
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

/** A 2/2 creature that comes into play tapped (cards.xml cipt). */
const tappedBear = (name: string) =>
  ({ ...found(name, 'Creature — Bear'), power: '2', toughness: '2', cipt: true }) as Awaited<ReturnType<typeof lookupCard>>;

// Read by the next render: useSettings is mocked, so a change does not re-render a mounted seat.
const setPreferences = (patch: Partial<Preferences>) => {
  vi.mocked(usePreferences).mockReturnValue({ ...PREFERENCE_DEFAULTS, ...patch });
};

const handButton = () => screen.getByTitle(/^Hand — /);
// The hand row is the element the hand button sits in.
const handBacks = () => handButton().parentElement!.querySelectorAll(`img[src="${CARD_BACK_URL}"]`);

afterEach(() => {
  vi.mocked(lookupCard).mockImplementation(async (name: string) =>
    ({ found: false, source: 'unknown', name, printings: [] }) as Awaited<ReturnType<typeof lookupCard>>);
  vi.mocked(usePreferences).mockReturnValue(PREFERENCE_DEFAULTS);
});

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

  it.each([true, false])('menu Play reads playToStack=%s from preferences', async (playToStack) => {
    setPreferences({ playToStack });
    const client = createMockWebClient();
    const game = client.request.game;
    renderWithProviders(<Game />, { preloadedState: buildSeatGameState(SPEC), webClient: client, route: '/game/1' });
    await act(async () => {});
    openContextMenu(cardEl(SHOCK.id, 'hand'));
    chooseMenuPath('Play');
    await act(async () => {});
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({
      startZone: ZoneName.HAND,
      targetZone: playToStack ? ZoneName.STACK : ZoneName.TABLE,
    });
  });

  describe('from the keyboard', () => {
    const BUTTON_RECT = { left: 40, top: 300, right: 96, bottom: 356, width: 56, height: 56, x: 40, y: 300 };

    it('names the button by the hand size and says it opens a menu', () => {
      renderSeatCell(SPEC);
      const button = screen.getByRole('button', { name: 'Hand — 2 cards' });
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
      ['Shift+F10', '{Shift>}{F10}{/Shift}'],
    ])('opens the hand menu under the button with %s, focus on its first entry', async (_key, keys) => {
      const user = userEvent.setup();
      renderSeatCell(SPEC);
      const button = handButton();
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ ...BUTTON_RECT, toJSON: () => BUTTON_RECT } as DOMRect);
      button.focus();
      await user.keyboard(keys);

      const menu = screen.getByRole('menu', { name: 'Hand' });
      expect(button).toHaveAttribute('aria-expanded', 'true');
      // Below the button (its bottom edge plus the menu's 2px gap), not at the viewport's corner.
      expect(menu.style.top).toBe(`${BUTTON_RECT.bottom + 2}px`);
      expect(menu.style.left).toBe(`${BUTTON_RECT.left}px`);
      expect(within(menu).getByRole('menuitem', { name: 'View hand' })).toHaveFocus();
    });

    it('gives focus back to the button when the menu closes', async () => {
      const user = userEvent.setup();
      renderSeatCell(SPEC);
      handButton().focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(handButton()).toHaveFocus();
    });

    it('names another player\'s hand button by its size too', () => {
      renderSeatCell(SPEC, 2);
      expect(screen.getByRole('button', { name: 'Hand — 3 cards' })).toBeDisabled();
    });
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

  it('with "Play all nonlands onto the stack" off, plays a creature to the battlefield with its seat metadata P/T and cipt', async () => {
    setPreferences({ playToStack: false });
    vi.mocked(lookupCard).mockImplementation(async (name: string) => tappedBear(name));
    const deckList = '<?xml version="1.0"?><cockatrice_deck version="1"><zone name="main">'
      + '<card number="1" name="Shock"/></zone></cockatrice_deck>';
    const { game } = renderSeatCell({ ...SPEC, seats: [{ ...SPEC.seats[0], deckList }, SPEC.seats[1]] });
    // The seat's deck prefetch fills cardMetaByName before the double-click.
    await waitFor(() => expect(lookupCard).toHaveBeenCalledWith('Shock'));
    await act(async () => {});
    vi.mocked(lookupCard).mockClear();

    fireEvent.doubleClick(cardEl(SHOCK.id, 'hand'));
    await waitFor(() => expect(game.moveCard).toHaveBeenCalledTimes(1));
    expect(lookupCard).not.toHaveBeenCalled();
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({
      startZone: ZoneName.HAND,
      targetZone: ZoneName.TABLE,
      cardsToMove: { card: [{ cardId: SHOCK.id, pt: '2/2', tapped: true }] },
    });
  });

  it('centres the hand row by default and starts it at the left when left justified', async () => {
    renderSeatCell(SPEC);
    const row = () => cardEl(FOREST.id, 'hand').parentElement!;
    expect(row()).toHaveClass('m-auto');
    expect(row().style.marginLeft).toBe('');
    cleanup();

    setPreferences({ leftJustifiedHand: true });
    renderSeatCell(SPEC);

    expect(row()).not.toHaveClass('m-auto');
    expect(row()).toHaveClass('mr-auto');
    expect(row().style.marginLeft).toBe('calc(var(--card-width, 72px) * 1.4)');
  });

  describe('vertical hand', () => {
    it('puts the hand in a column beside the info column, every card still playable', async () => {
      setPreferences({ horizontalHand: false });
      const { game } = renderSeatCell(SPEC);

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

    it('stacks the cards in order and brings the hovered one to the front in CSS, re-rendering nothing', async () => {
      setPreferences({ horizontalHand: false });
      renderSeatCell(SPEC);
      const slot = (id: number) => cardEl(id, 'hand').parentElement!;
      expect(slot(FOREST.id).style.zIndex).toBe('0');
      expect(slot(SHOCK.id).style.zIndex).toBe('1');
      expect(slot(FOREST.id)).toHaveClass('hover:!z-[999]');

      const shock = cardEl(SHOCK.id, 'hand');
      fireEvent.mouseEnter(slot(FOREST.id));
      expect(slot(FOREST.id).style.zIndex).toBe('0');
      expect(cardEl(SHOCK.id, 'hand')).toBe(shock);
    });

    it('shows another player\'s hand as a column of card backs', async () => {
      setPreferences({ horizontalHand: false });
      renderSeatCell(SPEC, 2);
      expect(screen.getByTestId('hand-zone-2').querySelectorAll(`img[src="${CARD_BACK_URL}"]`)).toHaveLength(3);
    });
  });
});
