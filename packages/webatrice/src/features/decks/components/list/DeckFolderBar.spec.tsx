import { fireEvent, render, screen } from '@testing-library/react';

import { DeckFolderBar } from './DeckFolderBar';

function renderBar(path: string, isConnected = true) {
  const props = { path, isConnected, onNavigate: vi.fn(), onNewFolder: vi.fn() };
  render(<DeckFolderBar {...props} />);
  return props;
}

describe('DeckFolderBar', () => {
  it('shows the path from the root and navigates up from any crumb', () => {
    const props = renderBar('Modern/Old');
    const crumbs = screen.getAllByRole('button').slice(0, 3);
    expect(crumbs.map((c) => c.textContent?.trim())).toEqual(['DeckFolders.root', 'Modern', 'Old']);
    expect(crumbs[2]).toHaveAttribute('aria-current', 'location');

    fireEvent.click(crumbs[1]);
    fireEvent.click(crumbs[0]);
    expect(props.onNavigate.mock.calls).toEqual([['Modern'], ['']]);
  });

  it('creates a folder while connected', () => {
    const props = renderBar('');
    fireEvent.click(screen.getByRole('button', { name: /DeckFolders.newFolder/ }));
    expect(props.onNewFolder).toHaveBeenCalled();
  });

  it('disables "New folder" offline', () => {
    renderBar('', false);
    expect(screen.getByRole('button', { name: /DeckFolders.newFolder/ })).toBeDisabled();
  });
});
