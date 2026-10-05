// The board without a pointer (aud.md G2, G3, G7, G10): cards are focusable
// options in their zones, and every card action has a keyboard path through
// the card, its menu or a target pick. Desktop has no keyboard path at all
// (every card is pointer-only, and dnd-kit's keyboard drag was never live
// here), so this spec replaces the keyboard-sensor suite origin/master skipped.
// Assertions are on the wire, through <Game /> with the real seat ports.

import { act, fireEvent, screen } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';
import { ZoneName } from '@cockatrice/sockatrice';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import { buildSeatGameState, cardEl, chooseMenuPath, openContextMenu, openMenus, type SeatGameSpec } from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../services/cards/catalog/lookup', async () =>
  (await import('./__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const OGRE = makeCard({ id: 10, name: 'Ogre', x: 0, y: 0, pt: '3/3' });
const WALL = makeCard({ id: 12, name: 'Wall', x: 3, y: 0 });
const FOREST = makeCard({ id: 30, name: 'Forest' });
const ISLAND = makeCard({ id: 31, name: 'Island' });
const BEAR = makeCard({ id: 20, name: 'Bear', x: 0, y: 0, pt: '2/2' });
// The opponent's aura, attached to their Bear.
const AURA = makeCard({ id: 21, name: 'Aura', x: 0, y: 0, attachPlayerId: 2, attachZone: ZoneName.TABLE, attachCardId: 20 });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  activePlayerId: 1,
  seats: [
    { playerId: 1, name: 'Alice', table: [OGRE, WALL], hand: [FOREST, ISLAND], deckCount: 40 },
    { playerId: 2, name: 'Bob', table: [BEAR, AURA], handCount: 5, deckCount: 33 },
  ],
};

function renderGame() {
  const webClient = createMockWebClient();
  renderWithProviders(<Game />, { preloadedState: buildSeatGameState(SPEC), webClient });
  return webClient.request.game;
}

const key = (el: Element, init: { key: string; shiftKey?: boolean }) => {
  act(() => {
    fireEvent.keyDown(el, init);
  });
};
const focus = (el: HTMLElement) => act(() => el.focus());

describe('the board from the keyboard', () => {
  it('makes each zone\'s cards named options, one tab stop per zone', () => {
    renderGame();
    expect(screen.getByRole('listbox', { name: 'Alice\'s hand, 2 cards' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ogre, power and toughness 3/3' })).toBe(cardEl(OGRE.id, 'battlefield'));
    expect([FOREST, ISLAND].map((c) => cardEl(c.id, 'hand').tabIndex)).toEqual([0, -1]);
  });

  it('selects with the arrows and plays a hand card on Enter', async () => {
    const game = renderGame();
    const forest = cardEl(FOREST.id, 'hand');
    focus(forest);
    key(forest, { key: 'ArrowRight' });
    expect(cardEl(ISLAND.id, 'hand')).toHaveFocus();
    expect(cardEl(ISLAND.id, 'hand')).toHaveAttribute('aria-selected', 'true');

    key(cardEl(ISLAND.id, 'hand'), { key: 'Enter' });
    await vi.waitFor(() => expect(game.moveCard).toHaveBeenCalledTimes(1));
    // As a double-click plays it: the catalog doesn't know the card, so it goes on the stack.
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({
      startZone: ZoneName.HAND,
      targetZone: ZoneName.STACK,
      cardsToMove: { card: [expect.objectContaining({ cardId: ISLAND.id })] },
    });
  });

  it('taps a battlefield card on Enter, the selection when the card is in it', () => {
    const game = renderGame();
    const ogre = cardEl(OGRE.id, 'battlefield');
    focus(ogre);
    key(ogre, { key: 'ArrowRight', shiftKey: true });
    expect(cardEl(WALL.id, 'battlefield')).toHaveFocus();
    key(cardEl(WALL.id, 'battlefield'), { key: 'Enter' });
    const tapped = Object.entries(game)
      .flatMap(([method, fn]) => (vi.isMockFunction(fn) ? fn.mock.calls.map((call) => [method, call[1]]) : []));
    expect(JSON.stringify(tapped)).toContain(String(OGRE.id));
    expect(JSON.stringify(tapped)).toContain(String(WALL.id));
  });

  it('moves a card to the graveyard through the menu Shift+F10 opens on it', () => {
    const game = renderGame();
    const forest = cardEl(FOREST.id, 'hand');
    focus(forest);
    key(forest, { key: 'F10', shiftKey: true });
    expect(openMenus()).toHaveLength(1);
    chooseMenuPath('Move to', 'Graveyard');
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({
      startZone: ZoneName.HAND,
      targetZone: ZoneName.GRAVE,
      cardsToMove: { card: [expect.objectContaining({ cardId: FOREST.id })] },
    });
  });

  it('leaves a zone with F6, where Tab would advance the phase', () => {
    renderGame();
    const ogre = cardEl(OGRE.id, 'battlefield');
    focus(ogre);
    key(ogre, { key: 'F6' });
    expect(document.activeElement).not.toBe(ogre);
    expect(document.activeElement?.closest('[data-card-id]')).not.toBe(ogre);
  });
});

describe('attach targets (desktop ArrowAttachItem::attachCards)', () => {
  const attach = (target: { playerId: number; cardId: number }) => ({
    startZone: ZoneName.TABLE,
    cardId: OGRE.id,
    targetPlayerId: target.playerId,
    targetZone: ZoneName.TABLE,
    targetCardId: target.cardId,
  });

  it('attaches to an opponent\'s card by pointer', () => {
    const game = renderGame();
    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath('Attach to card...');
    act(() => {
      fireEvent.pointerDown(cardEl(BEAR.id, 'battlefield'), { button: 0, clientX: 5, clientY: 5 });
    });
    act(() => {
      fireEvent.pointerUp(window, { button: 0, clientX: 5, clientY: 5 });
    });
    expect(game.attachCard).toHaveBeenCalledTimes(1);
    expect(vi.mocked(game.attachCard).mock.calls[0][1]).toMatchObject(attach({ playerId: 2, cardId: BEAR.id }));
  });

  it('picks the target from the keyboard: focus a card, Enter', () => {
    const game = renderGame();
    const ogre = cardEl(OGRE.id, 'battlefield');
    focus(ogre);
    key(ogre, { key: 'F10', shiftKey: true });
    chooseMenuPath('Attach to card...');
    const bear = cardEl(BEAR.id, 'battlefield');
    focus(bear);
    key(bear, { key: 'Enter' });
    expect(vi.mocked(game.attachCard).mock.calls[0][1]).toMatchObject(attach({ playerId: 2, cardId: BEAR.id }));
  });

  it('refuses a card that is attached itself, cancelling the pick', () => {
    const game = renderGame();
    openContextMenu(cardEl(OGRE.id, 'battlefield'));
    chooseMenuPath('Attach to card...');
    const aura = cardEl(AURA.id, 'battlefield');
    focus(aura);
    key(aura, { key: 'Enter' });
    expect(game.attachCard).not.toHaveBeenCalled();
    // The pick is over: Enter on the Bear now taps nothing of ours and attaches nothing.
    const bear = cardEl(BEAR.id, 'battlefield');
    focus(bear);
    key(bear, { key: 'Enter' });
    expect(game.attachCard).not.toHaveBeenCalled();
  });
});
