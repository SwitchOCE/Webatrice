import { fireEvent, render, screen } from '@testing-library/react';

import { DeckListHeader, type DeckListHeaderProps } from './DeckListHeader';

function renderHeader(overrides: Partial<DeckListHeaderProps> = {}) {
  const props: DeckListHeaderProps = {
    loading: false,
    deckCount: 1,
    isConnected: true,
    viewMode: 'card',
    onViewModeChange: vi.fn(),
    onRefresh: vi.fn(),
    onImport: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<DeckListHeader {...props} />);
  return props;
}

describe('DeckListHeader', () => {
  it('offers the share-link actions when given', () => {
    const props = renderHeader({ onOpenShareLink: vi.fn(), onShareLinks: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /OpenShareLink.open/ }));
    fireEvent.click(screen.getByRole('button', { name: /DeckShareLinks.open/ }));
    expect(props.onOpenShareLink).toHaveBeenCalled();
    expect(props.onShareLinks).toHaveBeenCalled();
  });

  it('disables the share-link actions while disconnected', () => {
    renderHeader({ isConnected: false, onOpenShareLink: vi.fn(), onShareLinks: vi.fn() });
    expect(screen.getByRole('button', { name: /OpenShareLink.open/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /DeckShareLinks.open/ })).toBeDisabled();
  });

  it('has no share-link actions without handlers', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /OpenShareLink.open/ })).toBeNull();
  });

  it('shows the deck count once loaded', () => {
    renderHeader({ deckCount: 1 });
    expect(screen.getByText('Decks.list.deckCount')).toBeInTheDocument();
  });

  it('shows a loading caption until the tree arrives', () => {
    renderHeader({ loading: true });
    expect(screen.getByText('Common.status.loading')).toBeInTheDocument();
  });

  it('wires the view toggle and the list actions', () => {
    const props = renderHeader();
    expect(screen.getByRole('button', { name: 'Decks.list.view.card' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Decks.list.view.compact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decks.list.refreshLabel' }));
    fireEvent.click(screen.getByRole('button', { name: /Decks.list.import/ }));
    fireEvent.click(screen.getByRole('button', { name: /Decks.list.newDeck/ }));
    expect(props.onViewModeChange).toHaveBeenCalledWith('compact');
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onImport).toHaveBeenCalled();
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('disables the server actions while disconnected', () => {
    renderHeader({ isConnected: false });
    expect(screen.getByRole('button', { name: 'Decks.list.refreshLabel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Decks.list.import/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Decks.list.newDeck/ })).toBeDisabled();
  });
});
