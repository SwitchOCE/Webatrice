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
    expect(screen.getByText('Decks.list.created')).toBeInTheDocument();
    // The folder is the list's breadcrumb, not repeated per row.
    expect(screen.queryByText('Cube/Old')).toBeNull();
    expect(screen.getByText('Decks.badge.bracketShort')).toHaveAttribute('title', 'Decks.badge.bracket');
    expect(screen.getByText('$12.50+')).toHaveAttribute('title', 'Decks.badge.priceTotalMissing');
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
    expect(screen.getByTitle('Decks.badge.priceLoading')).toBeInTheDocument();
    rerender(<DeckRow deck={deck} summary={{}} mode="card" onOpen={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens on click and deletes without opening', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<DeckRow deck={deck} summary={undefined} mode="card" onOpen={onOpen} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decks.list.deleteDeckNamed' }));
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

  it.each(['card', 'compact'] as const)('%s layout offers share and publish when given', (mode) => {
    const onShare = vi.fn();
    const onTogglePublic = vi.fn();
    const onOpen = vi.fn();
    render(
      <DeckRow
        deck={{ ...deck, visibility: 'public' }}
        summary={{}}
        mode={mode}
        onOpen={onOpen}
        onDelete={() => {}}
        onShare={onShare}
        onTogglePublic={onTogglePublic}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.shareDeckNamed' }));
    const publish = screen.getByRole('button', { name: 'DeckSharing.publishNamed' });
    expect(publish).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(publish);
    expect(onShare).toHaveBeenCalled();
    expect(onTogglePublic).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows desktop\'s Public / Public (inherited) state, and nothing for a private deck', () => {
    const row = (visibility: FlatDeck['visibility']) => (
      <DeckRow deck={{ ...deck, visibility }} summary={{}} mode="compact" onOpen={() => {}} onDelete={() => {}} />
    );
    const { rerender } = render(row('public'));
    expect(screen.getByText('DeckSharing.public')).toHaveAttribute('title', 'DeckSharing.deckPublic');
    rerender(row('inherited'));
    expect(screen.getByText('DeckSharing.inherited')).toHaveAttribute('title', 'DeckSharing.deckInherited');
    rerender(row('private'));
    expect(screen.queryByText(/DeckSharing.public|DeckSharing.inherited/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'DeckSharing.shareDeckNamed' })).toBeNull();
  });
});
