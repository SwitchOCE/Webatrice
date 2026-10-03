import { fireEvent, render, screen } from '@testing-library/react';

import { DeleteDeckDialog } from './DeleteDeckDialog';

describe('DeleteDeckDialog', () => {
  it('names the deck and confirms or cancels', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<DeleteDeckDialog deckName="Burn" onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Delete deck?' })).toHaveTextContent('Burn will be permanently removed');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
