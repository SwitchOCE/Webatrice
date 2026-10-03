import { fireEvent, render, screen } from '@testing-library/react';

import { DeckFolderRow } from './DeckFolderRow';

const folder = { name: 'Modern', path: 'Modern', deckCount: 3, folderCount: 1 };

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
});
