import { fireEvent, render, screen } from '@testing-library/react';

import type { FlatDeck } from '../../deckTree';
import { DeckListSections } from './DeckListSections';
import { DeckListEmpty, DeckListLoading } from './DeckListStates';

const burn: FlatDeck = { id: 1, name: 'Burn', path: '', creationTime: 0, visibility: 'private' };
const elves: FlatDeck = { id: 2, name: 'Elves', path: '', creationTime: 0, visibility: 'private' };

describe('DeckListSections', () => {
  it('titles each format section with its deck count and wires the rows', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <DeckListSections
        sections={[{ section: 'modern', decks: [burn, elves] }, { section: 'loading', decks: [] }]}
        summaries={new Map([[1, { format: 'modern' }]])}
        mode="compact"
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Modern2', 'Loading…0']);
    fireEvent.click(screen.getByText('Elves'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Burn' }));
    expect(onOpen).toHaveBeenCalledWith(elves);
    expect(onDelete).toHaveBeenCalledWith(burn);
  });
});

describe('DeckListStates', () => {
  it('shows loading and an empty state with a create action', () => {
    const onCreate = vi.fn();
    render(
      <>
        <DeckListLoading />
        <DeckListEmpty onCreate={onCreate} disabled={false} />
      </>,
    );
    expect(screen.getByText('Loading decks…')).toBeInTheDocument();
    expect(screen.getByText('No decks yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New deck/ }));
    expect(onCreate).toHaveBeenCalled();
  });
});
