import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';

import { renderWithProviders } from '../../../../__test-utils__';
import { groupDeckCards } from '../../deckGrouping';
import type { HydratedDeck } from '../../types';
import { DeckMainPane, type DeckMainPaneProps } from './DeckMainPane';

vi.mock('../breakdown/DeckBreakdown', () => ({ DeckBreakdown: () => <div>breakdown</div> }));
vi.mock('../search/AdvancedCardSearch', () => ({
  AdvancedCardSearch: ({ query }: { query: string }) => <div>advanced search for “{query}”</div>,
}));

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
  const props: DeckMainPaneProps = {
    deck,
    groups: groupDeckCards(deck.cards, false),
    onAddByName: vi.fn(),
    onInc: vi.fn(),
    onDelete: vi.fn(),
    onSetCategory: vi.fn(),
    onSetCommander: vi.fn(),
    onPreviewCard: vi.fn(),
    onChangePrinting: vi.fn(),
    onCardClick: vi.fn(),
    cachedBracketAssessment: undefined,
    onBracketAssessmentComputed: vi.fn(),
    isMtg: true,
    isCommander: false,
    ...overrides,
  };
  function StatefulPane() {
    const [currentDeck, setDeck] = useState(props.deck);
    return (
      <DeckMainPane
        {...props}
        deck={currentDeck}
        groups={groupDeckCards(currentDeck.cards, props.isCommander)}
        onDelete={(index) => {
          props.onDelete(index);
          setDeck((current) => ({ ...current, cards: current.cards.filter((_, i) => i !== index) }));
        }}
      />
    );
  }
  renderWithProviders(<StatefulPane />);
  return props;
}

describe('DeckMainPane', () => {
  it('lays an MTG deck out in type sections above the breakdown', () => {
    renderPane();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['DeckEditor.section.instant4', 'DeckEditor.section.land16']);
    expect(screen.getByText('breakdown')).toBeInTheDocument();
  });

  it('hands the quick-add text over to advanced search, and comes back to the deck', () => {
    renderPane();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bolt' } });
    fireEvent.click(screen.getByRole('button', { name: /DeckEditor.main.advancedSearch/ }));
    expect(screen.getByText('advanced search for “bolt”')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /DeckEditor.main.backToDeck/ }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('shows a plain list with name entry for non-MTG decks', () => {
    const props = renderPane({ isMtg: false });
    expect(screen.queryByRole('button', { name: /DeckEditor.main.advancedSearch/ })).toBeNull();
    expect(screen.queryByText('breakdown')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('DeckEditor.list.addPlaceholder'), { target: { value: 'Hedge Wizard' } });
    fireEvent.keyDown(screen.getByPlaceholderText('DeckEditor.list.addPlaceholder'), { key: 'Enter' });
    expect(props.onAddByName).toHaveBeenCalledWith('Hedge Wizard');
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
    expect(row).not.toBeInTheDocument();
    expect(isMtg ? screen.getByRole('combobox') : screen.getByPlaceholderText('DeckEditor.list.addPlaceholder'))
      .toHaveFocus();
  });
});
