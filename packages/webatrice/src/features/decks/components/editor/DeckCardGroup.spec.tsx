import { fireEvent, render, screen } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { DeckCardGroup, type DeckCardGroupProps } from './DeckCardGroup';

const cards: DeckCard[] = [
  { name: 'Forest', quantity: 10, category: 'main', lookupSource: 'scryfall', typeLine: 'Land' },
  { name: 'Mystery', quantity: 1, category: 'main', lookupSource: 'unknown', manaCost: '{2}{G}' },
  { name: 'Bayou', quantity: 2, category: 'main', lookupSource: 'scryfall', typeLine: 'Land' },
];

function renderGroup(overrides: Partial<DeckCardGroupProps> = {}) {
  const props: DeckCardGroupProps = {
    label: 'Land',
    indices: [2, 0],
    deck: cards,
    onInc: vi.fn(),
    onDelete: vi.fn(),
    onSetCategory: vi.fn(),
    onSetCommander: vi.fn(),
    onPreview: vi.fn(),
    onChangePrinting: vi.fn(),
    onCardClick: vi.fn(),
    isMtg: true,
    isCommander: false,
    ...overrides,
  };
  render(<DeckCardGroup {...props} />);
  return props;
}

describe('DeckCardGroup', () => {
  it('heads the section with its total quantity and lists rows in the given order', () => {
    renderGroup();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('DeckEditor.section.land12');
    expect(screen.getAllByRole('button', { name: /Bayou|Forest/ }).map((b) => b.textContent)).toEqual(['Bayou', 'Forest']);
  });

  it('wires each row to its deck index', () => {
    const props = renderGroup();
    fireEvent.mouseEnter(screen.getByText('Forest').parentElement!);
    fireEvent.click(screen.getByRole('button', { name: 'Bayou' }));
    expect(props.onPreview).toHaveBeenCalledWith(cards[0]);
    expect(props.onCardClick).toHaveBeenCalledWith(cards[2]);
  });

  it('flags cards the catalog could not find and draws mana costs', () => {
    renderGroup({ label: 'Other', indices: [1] });
    expect(screen.getByTitle('DeckEditor.row.unknown')).toBeInTheDocument();
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['{2}', '{G}']);
  });

  it('renders names as plain text when cards have no detail view', () => {
    renderGroup({ onCardClick: undefined });
    expect(screen.queryByRole('button', { name: 'Bayou' })).toBeNull();
    expect(screen.getByText('Bayou')).toBeInTheDocument();
  });
});
