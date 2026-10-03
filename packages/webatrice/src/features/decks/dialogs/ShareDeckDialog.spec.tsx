import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DeckShareCreateState } from '../hooks/useDeckSharing';
import { ShareDeckDialog } from './ShareDeckDialog';

function renderDialog(state: DeckShareCreateState = { status: 'idle' }) {
  const props = { open: true, defaultName: 'Shared decks', state, onClose: vi.fn(), onCreate: vi.fn() };
  render(<ShareDeckDialog {...props} />);
  return props;
}

const nameField = () => screen.getByRole('textbox', { name: 'DeckSharing.nameLabel' });

describe('ShareDeckDialog', () => {
  it('starts from desktop\'s default name and creates the link with the typed one', async () => {
    const props = renderDialog();
    expect(nameField()).toHaveValue('Shared decks');
    fireEvent.change(nameField(), { target: { value: '  Cube  ' } });
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.create/ }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('Cube'));
  });

  it('falls back to the default name when left empty, like desktop', async () => {
    const props = renderDialog();
    fireEvent.change(nameField(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.create/ }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('Shared decks'));
  });

  it('waits for the server', () => {
    renderDialog({ status: 'pending' });
    expect(screen.getByRole('status')).toHaveTextContent('DeckSharing.creating');
    expect(screen.getByRole('button', { name: /DeckSharing.create/ })).toBeDisabled();
  });

  it('shows the created link, its expiry and whether it was copied', () => {
    renderDialog({ status: 'created', link: 'https://x/?share=t', expiresAt: 1800000000n, itemCount: 1, copied: true });
    expect(screen.getByText('DeckSharing.createdCopied')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://x/?share=t')).toBeInTheDocument();
    expect(screen.getByText('DeckSharing.expires')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DeckSharing.create/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'DeckSharing.close' })).toBeInTheDocument();
  });

  it('copies the link again on request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDialog({ status: 'created', link: 'https://x/?share=t', expiresAt: 1n, itemCount: 1, copied: false });
    expect(screen.getByText('DeckSharing.created')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.copy/ }));
    expect(writeText).toHaveBeenCalledWith('https://x/?share=t');
    expect(await screen.findByRole('button', { name: /DeckSharing.copied/ })).toBeInTheDocument();
  });

  it('shows a failure and lets the user try again', () => {
    renderDialog({ status: 'failed', message: 'DeckSharing.createFailed' });
    expect(screen.getByRole('alert')).toHaveTextContent('DeckSharing.createFailed');
    expect(screen.getByRole('button', { name: /DeckSharing.create/ })).toBeEnabled();
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <ShareDeckDialog open={false} defaultName="x" state={{ status: 'idle' }} onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
