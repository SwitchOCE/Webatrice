import { act, fireEvent, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n, { type i18n as I18n } from 'i18next';
import ICU from 'i18next-icu';

import { renderWithProviders } from '../../../../__test-utils__';
import { emptyPriceLookup } from '../../pricing';
import type { ScryfallSearchCard } from '../../search';
import searchText from './CardSearch.i18n.json';
import CardSearchDock, { type CardSearchDockApi, type CardSearchDockProps } from './CardSearchDock';
import dockText from './CardSearchDock.i18n.json';
import { useCardDatabase, type CardDatabase } from './useCardDatabase';
import { useGameChangerList } from './useGameChangerList';
import { useCardPrintings } from '../../hooks/useCardPrintings';

vi.mock('./useCardDatabase', () => ({ useCardDatabase: vi.fn() }));
vi.mock('./useGameChangerList', () => ({ useGameChangerList: vi.fn(() => null) }));
vi.mock('../../hooks/useCardPrintings', () => ({ useCardPrintings: vi.fn() }));

const bowmasters: ScryfallSearchCard = {
  id: 'bow-1',
  name: 'Orcish Bowmasters',
  mana_cost: '{1}{B}',
  type_line: 'Creature — Orc Archer',
  prices: { usd: '43.37' },
  image_uris: { normal: 'https://img/bow.jpg', art_crop: 'https://img/bow-art.jpg' },
};
const esper: ScryfallSearchCard = { id: 'esp-1', name: 'Esper Sentinel', mana_cost: '{W}', type_line: 'Artifact Creature' };

function database(overrides: Partial<CardDatabase> = {}): CardDatabase {
  return {
    results: [bowmasters, esper],
    total: 2,
    fresh: true,
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
    ...overrides,
  };
}

let testI18n: I18n;

beforeAll(async () => {
  testI18n = i18n.createInstance();
  await testI18n.use(ICU).init({ lng: 'en', resources: { en: { translation: { ...searchText, ...dockText } } } });
});

beforeEach(() => {
  vi.mocked(useCardDatabase).mockReturnValue(database());
  vi.mocked(useGameChangerList).mockReturnValue(null);
  vi.mocked(useCardPrintings).mockReturnValue({
    printings: [
      { set: 'ltr', collectorNumber: '103', scryfallId: 'p-103' },
      { set: 'ltr', collectorNumber: '452', scryfallId: 'p-452' },
    ],
    loading: false,
    error: null,
    prices: { ...emptyPriceLookup(), byId: new Map([['p-452', { usd: 49.8, tcgplayer: null }]]) },
  });
});

function renderDock(props: Partial<CardSearchDockProps> = {}) {
  const onAdd = vi.fn();
  const onSelect = vi.fn();
  const view = renderWithProviders(
    <I18nextProvider i18n={testI18n}>
      <CardSearchDock onAdd={onAdd} onSelect={onSelect} {...props} />
    </I18nextProvider>,
  );
  return { onAdd, onSelect, unmount: view.unmount, input: screen.getByRole('textbox', { name: 'Search cards' }) };
}

describe('CardSearchDock', () => {
  it('searches the typed text inside the commander’s colours and format', () => {
    const { input } = renderDock({ colorIdentity: ['W', 'U', 'B', 'G'], format: 'commander' });
    fireEvent.change(input, { target: { value: 'orc' } });
    expect(useCardDatabase).toHaveBeenLastCalledWith('orc id<=wubg f:commander');
    expect(screen.getByRole('combobox', { name: 'Colour match' })).toHaveValue('withinIdentity');
    expect(screen.getByRole('checkbox', { name: 'Legal in DeckFormat.commander' })).toBeChecked();
  });

  it('does not search until there is text or a filter', () => {
    vi.mocked(useCardDatabase).mockReturnValue(database({ results: [], total: 0 }));
    renderDock({ colorIdentity: ['G'], format: 'commander' });
    expect(useCardDatabase).toHaveBeenLastCalledWith('');
    expect(screen.getByText(dockText.CardSearchDock.empty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Creature' }));
    expect(useCardDatabase).toHaveBeenLastCalledWith('id<=g t:creature f:commander');
  });

  it('lists results with cost, type, price and both add buttons', () => {
    const { onAdd } = renderDock({ deckCards: [{ name: 'Esper Sentinel', quantity: 1, category: 'main', lookupSource: 'scryfall' }] });
    const results = screen.getByRole('region', { name: 'Search results' });
    expect(within(results).getByText('Orcish Bowmasters')).toBeInTheDocument();
    expect(within(results).getByText(/Creature — Orc Archer/)).toHaveTextContent('$43.37');
    expect(screen.getByText(/1 in deck/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Esper Sentinel to the sideboard' }));
    expect(onAdd).toHaveBeenCalledWith('Esper Sentinel', 'side', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Add Orcish Bowmasters to the deck' }));
    expect(onAdd).toHaveBeenLastCalledWith('Orcish Bowmasters', 'main', undefined);
    expect(screen.getByText('Added Orcish Bowmasters to the deck')).toBeInTheDocument();
  });

  it('moves the highlight with the arrows, adds with Enter and sends Ctrl+Enter to the sideboard', () => {
    const { input, onAdd, onSelect } = renderDock();
    expect(onSelect).toHaveBeenLastCalledWith('Orcish Bowmasters');

    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('Esper Sentinel');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Esper Sentinel', 'main', undefined);

    fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(onAdd).toHaveBeenLastCalledWith('Orcish Bowmasters', 'side', undefined);
  });

  it('shows the key hints from the shortcut bindings', () => {
    renderDock();
    const footer = screen.getByText('Ctrl+Enter').closest('footer')!;
    expect(footer).toHaveTextContent(/^Enter adds.*Ctrl\+Enter to sideboard$/);
  });

  it('adds the printing picked in the strip', async () => {
    const { input, onAdd } = renderDock();
    const strip = await screen.findByRole('region', { name: 'Printings of Orcish Bowmasters' });
    expect(within(strip).getByText('2 printings')).toBeInTheDocument();
    expect(within(strip).getByText('$49.80')).toBeInTheDocument();

    const pick = within(strip).getByRole('button', { name: /LTR #452/ });
    fireEvent.click(pick);
    expect(pick).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onAdd).toHaveBeenLastCalledWith('Orcish Bowmasters', 'main', 'p-452');
  });

  it('notes a Game Changer only once the list is available', () => {
    const { unmount } = renderDock({ format: 'commander', deckCards: [] });
    expect(screen.queryByText(/Game Changer/)).not.toBeInTheDocument();
    unmount();

    vi.mocked(useGameChangerList).mockReturnValue(new Set(['Orcish Bowmasters']));
    renderDock({ format: 'commander', deckCards: [] });
    expect(screen.getByText('Game Changer. Adding it makes 1; Bracket 3 allows 3.')).toBeInTheDocument();
  });

  it('switches to an art grid that keeps visible add buttons', () => {
    const { onAdd } = renderDock();
    fireEvent.click(screen.getByRole('radio', { name: 'Art' }));
    expect(screen.getByRole('button', { name: 'Orcish Bowmasters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Esper Sentinel to the deck' }));
    expect(onAdd).toHaveBeenLastCalledWith('Esper Sentinel', 'main', undefined);
  });

  it('offers more results when Scryfall has another page', () => {
    const loadMore = vi.fn();
    vi.mocked(useCardDatabase).mockReturnValue(database({ total: 412, hasMore: true, loadMore }));
    const { input } = renderDock();
    fireEvent.change(input, { target: { value: 'elf' } });
    expect(screen.getByText('412 matches')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more (2 of 412)' }));
    expect(loadMore).toHaveBeenCalled();
  });

  it('keeps the previous results visible but not addable while the next search loads', () => {
    vi.mocked(useCardDatabase).mockReturnValue(database({ fresh: false, loading: true }));
    const { input, onAdd } = renderDock();
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Add Orcish Bowmasters to the deck' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('leaves Enter and the arrows to an input method while it is composing', () => {
    const { input, onAdd, onSelect } = renderDock();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Process', code: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown', isComposing: true });
    expect(onAdd).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalledWith('Esper Sentinel');
  });

  it('hands the editor a way to focus the search field', () => {
    let api: CardSearchDockApi | undefined;
    const { input } = renderDock({ onReady: (a) => {
      api = a;
    } });
    act(() => api!.focusSearch());
    expect(input).toHaveFocus();
  });
});
