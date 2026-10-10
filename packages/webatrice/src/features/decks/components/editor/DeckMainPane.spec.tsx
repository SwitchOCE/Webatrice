import { fireEvent, screen } from '@testing-library/react';
import { createRef, useState } from 'react';

import { renderWithProviders } from '../../../../__test-utils__';
import { groupDeckCards } from '../../deckGrouping';
import type { HydratedDeck } from '../../types';
import { DeckMainPane, type DeckMainPaneProps } from './DeckMainPane';

const deck: HydratedDeck = {
  name: 'Burn',
  meta: { v: 1, updatedAt: 'x' },
  format: 'modern',
  cards: [
    { name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', typeLine: 'Instant' },
    { name: 'Mountain', quantity: 16, category: 'main', lookupSource: 'scryfall', typeLine: 'Basic Land' },
  ],
};

function renderPane(overrides: Partial<DeckMainPaneProps> = {}) {
  const addField = createRef<HTMLInputElement>();
  const props: DeckMainPaneProps = {
    deck,
    groups: groupDeckCards(deck.cards, false),
    selected: null,
    onSelect: vi.fn(),
    onInc: vi.fn(),
    onDelete: vi.fn(),
    onSetCategory: vi.fn(),
    onSetCommander: vi.fn(),
    onChangePrinting: vi.fn(),
    onShowDetails: vi.fn(),
    addFieldRef: addField,
    isMtg: true,
    isCommander: false,
    ...overrides,
  };
  function StatefulPane() {
    const [currentDeck, setDeck] = useState(props.deck);
    return (
      <>
        <input ref={addField} aria-label="add" />
        <DeckMainPane
          {...props}
          deck={currentDeck}
          groups={groupDeckCards(currentDeck.cards, props.isCommander)}
          onDelete={(index) => {
            props.onDelete(index);
            setDeck((current) => ({ ...current, cards: current.cards.filter((_, i) => i !== index) }));
          }}
        />
      </>
    );
  }
  renderWithProviders(<StatefulPane />);
  return props;
}

describe('DeckMainPane', () => {
  it('lays an MTG deck out in type sections', () => {
    renderPane();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['DeckEditor.section.instant4', 'DeckEditor.section.land16']);
  });

  it('selects a card from its row', () => {
    const props = renderPane();
    fireEvent.click(screen.getByRole('button', { name: 'Mountain' }));
    expect(props.onSelect).toHaveBeenCalledWith(deck.cards[1]);
  });

  it('shows a plain list for non-MTG decks', () => {
    renderPane({ isMtg: false });
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(screen.getByRole('grid', { name: 'DeckEditor.list.label' })).toBeInTheDocument();
  });

  it('explains how to start an empty deck', () => {
    renderPane({ deck: { ...deck, cards: [] }, groups: [] });
    expect(screen.getByText('DeckEditor.shell.noCards')).toBeInTheDocument();
  });

  it.each([true, false])('moves focus to the add field when the last card is removed (MTG: %s)', (isMtg) => {
    const one = { ...deck, cards: [deck.cards[0]] };
    const props = renderPane({ deck: one, groups: groupDeckCards(one.cards, false), isMtg });
    const row = screen.getByRole('row');
    row.focus();
    fireEvent.keyDown(row, { key: 'Delete' });
    expect(props.onDelete).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
    expect(screen.getByLabelText('add')).toHaveFocus();
  });
});
