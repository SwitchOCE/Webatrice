import { fireEvent, render, screen } from '@testing-library/react';

import type { FlatDeck } from '../../deckTree';
import { DeckRow } from './DeckRow';

const deck: FlatDeck = { id: 3, name: 'Superfriends', path: 'Cube/Old', creationTime: 0, visibility: 'private' };

describe('DeckRow', () => {
  it.each(['card', 'compact'] as const)('%s layout shows name, meta and badges from the summary', (mode) => {
    render(
      <DeckRow
        deck={deck}
        summary={{ format: 'commander', bracketLevel: 4, usd: 12.5, missing: 1, commanderName: 'Atraxa' }}
        mode={mode}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('Superfriends')).toBeInTheDocument();
    expect(screen.getByText('Commander')).toBeInTheDocument();
    expect(screen.getByText('Created unknown')).toBeInTheDocument();
    // The folder is the list's breadcrumb, not repeated per row.
    expect(screen.queryByText('Cube/Old')).toBeNull();
    expect(screen.getByText('B4')).toHaveAttribute('title', 'Commander Bracket 4');
    expect(screen.getByText('$12.50+')).toHaveAttribute('title', expect.stringContaining('1 card had no price'));
  });

  it('shows the deck tags', () => {
    render(<DeckRow deck={deck} summary={{ tags: ['Ramp', 'Tokens'] }} mode="compact" onOpen={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Ramp')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
  });

  it('shows the loading price until the summary arrives, and a dash without a cached price', () => {
    const { rerender } = render(
      <DeckRow deck={deck} summary={undefined} mode="card" onOpen={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByTitle('Loading price…')).toBeInTheDocument();
    rerender(<DeckRow deck={deck} summary={{}} mode="card" onOpen={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens on click and deletes without opening', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<DeckRow deck={deck} summary={undefined} mode="card" onOpen={onOpen} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Superfriends' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Superfriends'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it.each(['card', 'compact'] as const)('%s layout moves and downloads without opening', (mode) => {
    const onOpen = vi.fn();
    const onMove = vi.fn();
    const onDownload = vi.fn();
    render(
      <DeckRow
        deck={deck}
        summary={undefined}
        mode={mode}
        onOpen={onOpen}
        onDelete={() => {}}
        onMove={onMove}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'DeckFolders.moveDeckNamed' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckFolders.downloadDeckNamed' }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides move and download when not offered', () => {
    render(<DeckRow deck={deck} summary={undefined} mode="card" onOpen={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole('button', { name: 'DeckFolders.moveDeckNamed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'DeckFolders.downloadDeckNamed' })).toBeNull();
  });
});
