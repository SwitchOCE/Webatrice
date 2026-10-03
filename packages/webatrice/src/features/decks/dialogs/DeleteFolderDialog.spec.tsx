import { fireEvent, render, screen } from '@testing-library/react';

import { DeleteFolderDialog } from './DeleteFolderDialog';

describe('DeleteFolderDialog', () => {
  it('states what goes with the folder and confirms', () => {
    const props = { onCancel: vi.fn(), onConfirm: vi.fn() };
    render(<DeleteFolderDialog folder={{ name: 'Modern', path: 'Modern', deckCount: 3, folderCount: 1 }} {...props} />);
    expect(screen.getByText('DeleteFolder.scope')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'DeleteFolder.delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeleteFolder.cancel' }));
    expect(props.onConfirm).toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('skips the scope line for an empty folder', () => {
    render(
      <DeleteFolderDialog
        folder={{ name: 'Empty', path: 'Empty', deckCount: 0, folderCount: 0 }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText('DeleteFolder.scope')).toBeNull();
  });
});
