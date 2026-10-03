import { fireEvent, render, screen } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { PlainAddCard, PlainCardList } from './PlainCardList';

function card(name: string, quantity = 1): DeckCard {
  return { name, quantity, category: 'main', lookupSource: 'unknown' };
}

describe('PlainAddCard', () => {
  it('adds the trimmed name on Enter and clears the field', () => {
    const onAdd = vi.fn();
    render(<PlainAddCard onAdd={onAdd} />);
    const input = screen.getByPlaceholderText('Add a card by name');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '  Hedge Wizard ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('Hedge Wizard');
    expect(input).toHaveValue('');
  });
});

describe('PlainCardList', () => {
  it('lists cards alphabetically and edits them by their deck index', () => {
    const onInc = vi.fn();
    const onDelete = vi.fn();
    render(<PlainCardList cards={[card('zebra', 2), card('Apple')]} onInc={onInc} onDelete={onDelete} />);

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Apple', '2zebra']);
    fireEvent.click(screen.getByRole('button', { name: 'Increase zebra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Apple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove zebra' }));
    expect(onInc.mock.calls).toEqual([[0, 1], [1, -1]]);
    expect(onDelete).toHaveBeenCalledWith(0);
  });
});
