import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import ICU from 'i18next-icu';

import { EMPTY_FILTERS } from '../../cardSearchQuery';
import { useScryfallCardSearch } from '../../hooks/useScryfallCardSearch';
import { AdvancedCardSearch } from './AdvancedCardSearch';
import translations from './AdvancedCardSearch.i18n.json';

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
  it('names its query field for assistive technology, not only by placeholder', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: null });
    renderSearch();
    expect(screen.getByRole('textbox', { name: 'CardSearch.label' })).toHaveValue('bolt');
  });

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

  it('previews on keyboard focus, names the tile and announces the count and each add', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [bolt], loading: false, error: null });
    const handlers = renderSearch();
    const [count, added] = screen.getAllByRole('status');
    expect(count).toHaveTextContent('CardSearch.resultCount · bolt');
    expect(added).toBeEmptyDOMElement();

    const tile = screen.getByRole('button', { name: 'CardSearch.addCardTitle' });
    fireEvent.focus(tile);
    expect(handlers.onPreviewCard).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lightning Bolt' }));
    fireEvent.click(tile);
    expect(added).toHaveTextContent('CardSearch.added');
  });

  it('shows progress, errors and the empty prompt', () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: true, error: null });
    const { unmount } = render(
      <AdvancedCardSearch query="x" filters={EMPTY_FILTERS} onQueryChange={vi.fn()}
        onFiltersChange={vi.fn()} onAddByName={vi.fn()} onPreviewCard={vi.fn()} />,
    );
    expect(screen.getByText('CardSearch.searching')).toBeInTheDocument();
    unmount();

    vi.mocked(useScryfallCardSearch).mockReturnValue({ results: [], loading: false, error: { kind: 'failed' } });
    renderSearch();
    expect(screen.getByText('CardSearch.searchFailed')).toBeInTheDocument();
    expect(screen.queryByText('CardSearch.resultCount')).toBeNull();
    expect(screen.queryByText('CardSearch.noResults')).toBeNull();
  });

  it('renders a translated bad-query message with Scryfall details', async () => {
    vi.mocked(useScryfallCardSearch).mockReturnValue({
      results: [], loading: false, error: { kind: 'badQuery', details: 'Unknown color: purple' },
    });
    const testI18n = i18n.createInstance();
    await testI18n.use(ICU).init({ lng: 'en', resources: { en: { translation: translations } } });
    render(
      <I18nextProvider i18n={testI18n}>
        <AdvancedCardSearch query="c:purple" filters={EMPTY_FILTERS} onQueryChange={vi.fn()}
          onFiltersChange={vi.fn()} onAddByName={vi.fn()} onPreviewCard={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('Search failed: Unknown color: purple')).toHaveClass('text-danger');
    expect(screen.getAllByRole('status')[0]).not.toHaveTextContent('Showing');
    expect(screen.queryByText('No results.')).toBeNull();
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
