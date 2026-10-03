import { fireEvent, render, screen } from '@testing-library/react';

import { DeckFolderRow } from './DeckFolderRow';

const folder = { name: 'Modern', path: 'Modern', deckCount: 3, folderCount: 1, visibility: 'private' as const };

describe('DeckFolderRow', () => {
  it('opens, downloads and deletes the folder', () => {
    const props = { onOpen: vi.fn(), onDownload: vi.fn(), onDelete: vi.fn() };
    render(<DeckFolderRow folder={folder} {...props} />);
    expect(screen.getByText('DeckFolders.deckCount')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Modern'));
    fireEvent.click(screen.getByRole('button', { name: 'DeckFolders.downloadFolderNamed' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckFolders.deleteFolderNamed' }));
    expect(props.onOpen).toHaveBeenCalled();
    expect(props.onDownload).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('has nothing to download in an empty folder', () => {
    render(<DeckFolderRow folder={{ ...folder, deckCount: 0 }} onOpen={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'DeckFolders.downloadFolderNamed' })).toBeDisabled();
  });

  it('shares and publishes the folder when given, showing its visibility', () => {
    const props = { onOpen: vi.fn(), onDownload: vi.fn(), onDelete: vi.fn(), onShare: vi.fn(), onTogglePublic: vi.fn() };
    render(<DeckFolderRow folder={{ ...folder, visibility: 'inherited' }} {...props} />);
    expect(screen.getByText('DeckSharing.inherited')).toHaveAttribute('title', 'DeckSharing.folderInherited');
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.shareFolderNamed' }));
    const publish = screen.getByRole('button', { name: 'DeckSharing.publishNamed' });
    expect(publish).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(publish);
    expect(props.onShare).toHaveBeenCalled();
    expect(props.onTogglePublic).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('offers no share or publish without handlers', () => {
    render(<DeckFolderRow folder={folder} onOpen={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'DeckSharing.shareFolderNamed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'DeckSharing.publishNamed' })).toBeNull();
  });
});
