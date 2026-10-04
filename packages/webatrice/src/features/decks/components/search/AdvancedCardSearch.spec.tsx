import { fireEvent, render, screen } from '@testing-library/react';

import { EMPTY_FILTERS } from '../../cardSearchQuery';
import { useScryfallCardSearch } from '../../hooks/useScryfallCardSearch';
import { AdvancedCardSearch } from './AdvancedCardSearch';

vi.mock('../../hooks/useScryfallCardSearch', () => ({ useScryfallCardSearch: vi.fn() }));

const bolt = {
  id: 'id-bolt',
  name: 'Lightning Bolt',
  type_line: 'Instant',
  image_uris: { normal: 'https://img/bolt.jpg' },
};

function renderSearch(query = 'bolt', filters = EMPTY_FILTERS) {
  const handlers = {
    onQueryChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onAddByName: vi.fn(),
    onPreviewCard: vi.fn(),
  };
  render(<AdvancedCardSearch query={query} filters={filters} {...handlers} />);
  return handlers;
}

describe('AdvancedCardSearch', () => {
  it('searches the typed text combined with the filters', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: null });
    renderSearch('bolt', { ...EMPTY_FILTERS, colors: ['R'] });
    expect(useScryfallCardSearch).toHaveBeenLastCalledWith('bolt c:r');
    expect(screen.getByText('CardSearch.noResults')).toBeInTheDocument();
  });

  it('adds a clicked result and previews a hovered one', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [bolt], loading: false, error: null });
    const handlers = renderSearch();

    expect(screen.getByText('bolt')).toHaveClass('font-mono');
    const tile = screen.getByTitle('CardSearch.addCardTitle');
    fireEvent.mouseEnter(tile);
    fireEvent.click(tile);

    expect(handlers.onPreviewCard).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Lightning Bolt', scryfallId: 'id-bolt', imageUri: 'https://img/bolt.jpg',
    }));
    expect(handlers.onAddByName).toHaveBeenCalledWith('Lightning Bolt');
  });

  it('shows progress, errors and the empty prompt', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: true, error: null });
    const { unmount } = render(
      <AdvancedCardSearch query="x" filters={EMPTY_FILTERS} onQueryChange={vi.fn()}
        onFiltersChange={vi.fn()} onAddByName={vi.fn()} onPreviewCard={vi.fn()} />,
    );
    expect(screen.getByText('CardSearch.searching')).toBeInTheDocument();
    unmount();

    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: 'Search failed' });
    renderSearch();
    expect(screen.getByText('Search failed')).toBeInTheDocument();
    expect(screen.queryByText('CardSearch.resultCount')).toBeNull();
  });

  it('falls back to a generic message for a failure without one', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: '' });
    renderSearch();
    expect(screen.getByText('CardSearch.searchFailed')).toHaveClass('text-danger');
    expect(screen.queryByText('CardSearch.resultCount')).toBeNull();
  });

  it('prompts for a query when there is none, and passes typing up', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: null });
    const handlers = renderSearch('');
    expect(screen.getByText('CardSearch.emptyPrompt')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('CardSearch.placeholder'), {
      target: { value: 'o:draw' },
    });
    expect(handlers.onQueryChange).toHaveBeenCalledWith('o:draw');
  });
});
