import { fireEvent, render, screen } from '@testing-library/react';

import { CreateDeckDialog } from './CreateDeckDialog';

describe('CreateDeckDialog', () => {
  it('renders nothing while closed', () => {
    render(<CreateDeckDialog open={false} onClose={() => {}} onCreate={() => {}} />);
    expect(screen.queryByText('Create a deck')).toBeNull();
  });

  it('submits the trimmed name and lower-cased format on Create or Enter', () => {
    const onCreate = vi.fn();
    render(<CreateDeckDialog open onClose={() => {}} onCreate={onCreate} />);

    const name = screen.getByPlaceholderText('Untitled Deck');
    fireEvent.change(name, { target: { value: '  Brew ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pauper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenLastCalledWith('Brew', 'pauper');

    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it('blocks submit for "Other" with no custom format typed', () => {
    const onCreate = vi.fn();
    render(<CreateDeckDialog open onClose={() => {}} onCreate={onCreate} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'other' } });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Netrunner, Playtest, Cube'), { target: { value: 'Cube' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('', 'cube');
  });

  it('closes on Escape, the backdrop, and Cancel', () => {
    const onClose = vi.fn();
    render(<CreateDeckDialog open onClose={onClose} onCreate={() => {}} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
