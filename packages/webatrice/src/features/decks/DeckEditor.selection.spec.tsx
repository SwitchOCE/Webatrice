import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { fetchScryfallDetail, lookupCard } from '@app/services';

import { connected31State, createMockWebClient, renderWithProviders } from '../../__test-utils__';
import DeckEditor from './DeckEditor';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from './deckEditorCache';
import { deckSaveSignature } from './deckPersistence';
import { DECK_LAYOUT_STORAGE_KEY } from './deckEditorLayout';
import { emptyPriceLookup } from './pricing';
import type { DeckCard, HydratedDeck } from './types';
import { useCardDatabase } from './components/CardSearchDock/useCardDatabase';

vi.mock('./components/CardSearchDock/useCardDatabase', () => ({ useCardDatabase: vi.fn() }));
vi.mock('./components/CardSearchDock/useGameChangerList', () => ({ useGameChangerList: () => null }));
vi.mock('./hooks/useDeckPricing', () => ({ useDeckPricing: () => ({ prices: emptyPriceLookup(), loading: false }) }));
vi.mock('./hooks/useCardPrintings', () => ({
  useCardPrintings: () => ({
    printings: [
      { name: 'Sol Ring', scryfallId: 'sr-a', set: 'lea', collectorNumber: '1' },
      { name: 'Sol Ring', scryfallId: 'sr-b', set: 'c21', collectorNumber: '2' },
    ],
    loading: false,
    prices: emptyPriceLookup(),
  }),
}));
vi.mock('@app/services', async (original) => ({
  ...await original<typeof import('@app/services')>(), lookupCard: vi.fn(), fetchScryfallDetail: vi.fn(),
}));

const ring = (scryfallId: string, category: DeckCard['category'] = 'main', quantity = 1): DeckCard => ({
  name: 'Sol Ring', category, quantity, scryfallId, typeLine: 'Artifact', lookupSource: 'scryfall',
});
const currentCards = () => getCachedDeck(5)!.deck.cards;

beforeEach(() => {
  window.localStorage.removeItem(DECK_LAYOUT_STORAGE_KEY);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  clearDeckEditorCache();
  vi.mocked(useCardDatabase).mockReturnValue({
    results: [], total: 0, fresh: true, loading: false, loadingMore: false,
    error: null, hasMore: false, loadMore: vi.fn(),
  });
  vi.mocked(lookupCard).mockResolvedValue({ found: false, source: 'unknown', name: 'Sol Ring', printings: [] });
  vi.mocked(fetchScryfallDetail).mockResolvedValue(null);
});
afterEach(() => {
  clearDeckEditorCache();
  vi.unstubAllGlobals();
});

async function renderEditor(cards: DeckCard[]) {
  const deck: HydratedDeck = { name: 'Selection', format: 'standard', cards, meta: { v: 1, updatedAt: '' } };
  setCachedDeck(5, { deck, savedSignature: deckSaveSignature(deck) });
  renderWithProviders(<Routes><Route path="/deck/:deckId" element={<DeckEditor />} /></Routes>, {
    route: '/deck/5', preloadedState: connected31State, webClient: createMockWebClient(),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'DeckEditor.inspector.toggle' }));
  return within(screen.getByRole('complementary', { name: 'DeckEditor.inspector.label' }));
}

it('chooses a search printing without changing an existing deck row, then Enter adds that printing', async () => {
  const searchCard = { id: 'sr-a', name: 'Sol Ring', type_line: 'Artifact', set: 'lea' };
  vi.mocked(useCardDatabase).mockReturnValue({
    results: [searchCard], total: 1, fresh: true, loading: false, loadingMore: false,
    error: null, hasMore: false, loadMore: vi.fn(),
  });
  const inspector = await renderEditor([ring('sr-a')]);
  const before = currentCards();
  expect(inspector.queryByRole('button', { name: /DeckInspector.changePrinting/ })).toBeNull();
  const dock = within(screen.getByRole('complementary', { name: 'DeckEditor.dock.label' }));
  fireEvent.click(await dock.findByRole('button', { name: /C21/ }));
  expect(currentCards()).toEqual(before);
  const search = screen.getByPlaceholderText('CardSearchDock.placeholder');
  fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });
  await waitFor(() => expect(currentCards()).toHaveLength(2));
  expect(currentCards().map(({ scryfallId, quantity }) => ({ scryfallId, quantity }))).toEqual([
    { scryfallId: 'sr-a', quantity: 1 }, { scryfallId: 'sr-b', quantity: 1 },
  ]);
});

it.each([false, true])('keeps the panel selection and focus after a printing change (merge: %s)', async (merge) => {
  await renderEditor(merge ? [ring('sr-c'), ring('sr-b'), ring('sr-a')] : [ring('sr-c'), ring('sr-a')]);
  const rows = screen.getAllByRole('row');
  fireEvent.click(rows.at(-1)!);
  const inspector = within(screen.getByRole('region', { name: 'DeckInspector.title' }));
  fireEvent.click(inspector.getByRole('button', { name: /DeckInspector.changePrinting/ }));
  const printing = inspector.getByRole('button', { name: /C21/ });
  await userEvent.click(printing);
  expect(screen.queryByText('DeckInspector.empty')).not.toBeInTheDocument();
  expect(printing).toHaveFocus();
  expect(currentCards()).toHaveLength(2);
  expect(currentCards()[0]).toMatchObject({ scryfallId: 'sr-c', quantity: 1 });
  expect(currentCards()[1]).toMatchObject({ scryfallId: 'sr-b', quantity: merge ? 2 : 1 });
  fireEvent.click(inspector.getByRole('button', { name: 'DeckInspector.increaseMain' }));
  await act(async () => {});
  expect(currentCards()[0].quantity).toBe(1);
  expect(currentCards()[1].quantity).toBe(merge ? 3 : 2);
});

it.each(['main', 'sideboard'] as const)(
  'follows the remaining copy and focuses the same stepper plus when %s reaches zero', async (zone) => {
    const remainingZone = zone === 'main' ? 'sideboard' : 'main';
    const decrease = zone === 'main' ? 'DeckInspector.decreaseMain' : 'DeckInspector.decreaseSide';
    const increase = zone === 'main' ? 'DeckInspector.increaseMain' : 'DeckInspector.increaseSide';
    const inspector = await renderEditor([ring('sr-a', zone), ring('sr-a', remainingZone)]);
    fireEvent.click(screen.getAllByRole('row').find((row) => row.getAttribute('data-deck-row') === `${zone}:Sol Ring:sr-a`)!);
    await userEvent.click(inspector.getByRole('button', { name: decrease }));
    expect(inspector.queryByText('DeckInspector.empty')).not.toBeInTheDocument();
    expect(currentCards()).toEqual([ring('sr-a', remainingZone)]);
    expect(inspector.getByRole('button', { name: increase })).toHaveFocus();
    await userEvent.click(inspector.getByRole('button', {
      name: remainingZone === 'main' ? 'DeckInspector.increaseMain' : 'DeckInspector.increaseSide',
    }));
    expect(currentCards()[0].quantity).toBe(2);
  },
);

it.each(['next', 'previous', 'empty', 'collapsed'])(
  'uses grid neighbour focus or the add field after panel Remove (%s)', async (scenario) => {
    const next: DeckCard = {
      name: 'Another card', category: 'main', quantity: 1, lookupSource: 'unknown',
      typeLine: scenario === 'previous' ? 'Artifact' : 'Sorcery',
    };
    const inspector = await renderEditor(scenario === 'empty' ? [ring('sr-a')] : [ring('sr-a'), next]);
    const removed = screen.getAllByRole('row').find((row) => within(row).queryByRole('button', { name: 'Sol Ring' }))!;
    const list = removed.closest('main')!;
    const remaining = screen.queryAllByRole('row').find((row) => within(row).queryByRole('button', { name: 'Another card' }));
    fireEvent.click(removed);
    if (scenario === 'collapsed') {
      fireEvent.click(screen.getByRole('button', { name: /^DeckEditor\.section\.artifact/ }));
    }
    await userEvent.click(inspector.getByRole('button', { name: 'DeckInspector.remove' }));
    expect(removed).not.toBeInTheDocument();
    expect(scenario === 'empty' ? screen.getByPlaceholderText('CardSearchDock.placeholder') : remaining).toHaveFocus();
    expect(list).not.toHaveAttribute('tabindex');
  },
);

it.each(['main', 'sideboard'] as const)('focuses the add field after the last inspected copy is decremented from %s', async (zone) => {
  const remaining: DeckCard[] = zone === 'main'
    ? [{ name: 'Ponder', category: 'main', quantity: 1, lookupSource: 'unknown', typeLine: 'Sorcery' }]
    : [];
  const inspector = await renderEditor([ring('sr-a', zone), ...remaining]);
  fireEvent.click(screen.getAllByRole('row').find((row) => within(row).queryByRole('button', { name: 'Sol Ring' }))!);
  await userEvent.click(inspector.getByRole('button', {
    name: zone === 'main' ? 'DeckInspector.decreaseMain' : 'DeckInspector.decreaseSide',
  }));
  expect(inspector.getByText('DeckInspector.empty')).toBeInTheDocument();
  expect(currentCards()).toEqual(remaining);
  expect(screen.getByPlaceholderText('CardSearchDock.placeholder')).toHaveFocus();
});

it.each(['row', 'search'] as const)('fetches and shows details after pointer enter then click on the same %s', async (origin) => {
  vi.mocked(fetchScryfallDetail).mockImplementation(async (id, name) => ({
    id: id ?? name, name, oracle_text: `${name} rules text`, flavor_text: `${name} flavour text`, power: '2', toughness: '3',
  }));
  if (origin === 'search') {
    vi.mocked(useCardDatabase).mockReturnValue({
      results: [
        { id: 'sr-a', name: 'Sol Ring', type_line: 'Artifact' },
        { id: 'bears', name: 'Grizzly Bears', type_line: 'Creature' },
      ],
      total: 2, fresh: true, loading: false, loadingMore: false, error: null, hasMore: false, loadMore: vi.fn(),
    });
  }
  const inspector = await renderEditor(origin === 'row' ? [ring('sr-a')] : []);
  if (origin === 'search') {
    await inspector.findByText('Sol Ring rules text');
  }
  vi.mocked(fetchScryfallDetail).mockClear();
  const name = origin === 'row' ? 'Sol Ring' : 'Grizzly Bears';
  const button = origin === 'row'
    ? within(screen.getByRole('row')).getByRole('button', { name })
    : within(screen.getByRole('complementary', { name: 'DeckEditor.dock.label' })).getByRole('button', { name: /^Grizzly Bears/ });
  const target = origin === 'row' ? button.closest('[role="row"]')! : button.closest('li')!;
  fireEvent.pointerEnter(target);
  expect(fetchScryfallDetail).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(await inspector.findByText(`${name} rules text`)).toBeInTheDocument();
  expect(inspector.getByText(`${name} flavour text`)).toBeInTheDocument();
  expect(inspector.getByText('2/3')).toBeInTheDocument();
  expect(fetchScryfallDetail).toHaveBeenCalledTimes(1);
  expect(fetchScryfallDetail).toHaveBeenCalledWith(origin === 'row' ? 'sr-a' : 'bears', name, expect.any(AbortSignal));
});
