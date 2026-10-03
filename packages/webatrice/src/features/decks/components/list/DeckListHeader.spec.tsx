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
    expect(screen.getByText('1 deck on this server')).toBeInTheDocument();
  });

  it('shows a loading caption until the tree arrives', () => {
    renderHeader({ loading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('wires the view toggle and the list actions', () => {
    const props = renderHeader();
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Compact view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh deck list' }));
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    fireEvent.click(screen.getByRole('button', { name: /New deck/ }));
    expect(props.onViewModeChange).toHaveBeenCalledWith('compact');
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onImport).toHaveBeenCalled();
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('disables the server actions while disconnected', () => {
    renderHeader({ isConnected: false });
    expect(screen.getByRole('button', { name: 'Refresh deck list' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Import/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /New deck/ })).toBeDisabled();
  });
});
