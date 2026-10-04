import { fireEvent, render, screen, within } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { DeckRowActionsMenu } from './DeckRowActionsMenu';

const atraxa: DeckCard = { name: 'Atraxa', quantity: 1, category: 'main', lookupSource: 'scryfall' };

function renderMenu(card: DeckCard = atraxa, flags = { isMtg: true, isCommander: true }) {
  const handlers = {
    onInc: vi.fn(),
    onDec: vi.fn(),
    onDelete: vi.fn(),
    onSetCategory: vi.fn(),
    onSetCommander: vi.fn(),
    onChangePrinting: vi.fn(),
  };
  render(<DeckRowActionsMenu card={card} {...handlers} {...flags} />);
  fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.rowActions.trigger' }));
  return { handlers, menu: () => within(screen.getByRole('menu')) };
}

describe('DeckRowActionsMenu', () => {
  it('opens a menu with quantity controls that stay open', () => {
    const { handlers, menu } = renderMenu();
    fireEvent.click(menu().getByRole('button', { name: 'DeckEditor.rowActions.increase' }));
    fireEvent.click(menu().getByRole('button', { name: 'DeckEditor.rowActions.decrease' }));
    expect(handlers.onInc).toHaveBeenCalled();
    expect(handlers.onDec).toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('runs an action and closes', () => {
    const { handlers, menu } = renderMenu();
    fireEvent.click(menu().getByRole('menuitem', { name: 'DeckEditor.rowActions.markCommander' }));
    expect(handlers.onSetCommander).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers moving a sideboard card to main, and blocks sideboarding the commander', () => {
    const side = renderMenu({ ...atraxa, category: 'sideboard' });
    fireEvent.click(side.menu().getByRole('menuitem', { name: 'DeckEditor.rowActions.moveToMain' }));
    expect(side.handlers.onSetCategory).toHaveBeenCalledWith('main');
  });

  it('disables sideboarding a commander', () => {
    const { menu } = renderMenu({ ...atraxa, isCommander: true });
    expect(menu().getByRole('menuitem', { name: 'DeckEditor.rowActions.moveToSideboard' })).toBeDisabled();
    expect(menu().getByRole('menuitem', { name: 'DeckEditor.rowActions.unmarkCommander' })).toBeInTheDocument();
  });

  it('drops the printing and commander items for decks that cannot use them', () => {
    const { menu } = renderMenu(atraxa, { isMtg: false, isCommander: false });
    expect(menu().queryByRole('menuitem', { name: 'DeckEditor.rowActions.changePrinting' })).toBeNull();
    expect(menu().queryByRole('menuitem', { name: /Commander/ })).toBeNull();
    expect(menu().getByRole('menuitem', { name: 'Common.action.remove' })).toBeInTheDocument();
  });

  it('closes on Escape and on an outside click', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.rowActions.trigger' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
