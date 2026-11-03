import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { lookupCard } from '@app/services';

import { connected31State, createMockWebClient, renderWithProviders } from '../../__test-utils__';
import DeckEditor from './DeckEditor';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from './deckEditorCache';
import { deckSaveSignature } from './deckPersistence';
import { emptyPriceLookup } from './pricing';
import type { DeckCard, HydratedDeck } from './types';
import { useCardDatabase } from './components/CardSearchDock/useCardDatabase';

vi.mock('./components/CardSearchDock/useCardDatabase', () => ({ useCardDatabase: vi.fn() }));
vi.mock('./components/CardSearchDock/useGameChangerList', () => ({ useGameChangerList: () => null }));
vi.mock('./hooks/useCardDetail', () => ({ useCardDetail: () => ({ detail: null }) }));
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
  ...await original<typeof import('@app/services')>(), lookupCard: vi.fn(),
}));

const ring = (scryfallId: string, category: DeckCard['category'] = 'main', quantity = 1): DeckCard => ({
  name: 'Sol Ring', category, quantity, scryfallId, typeLine: 'Artifact', lookupSource: 'scryfall',
});
const currentCards = () => getCachedDeck(5)!.deck.cards;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  clearDeckEditorCache();
  vi.mocked(useCardDatabase).mockReturnValue({
    results: [], total: 0, fresh: true, loading: false, loadingMore: false,
    error: null, hasMore: false, loadMore: vi.fn(),
  });
  vi.mocked(lookupCard).mockResolvedValue({ found: false, source: 'unknown', name: 'Sol Ring', printings: [] });
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
  fireEvent.click(inspector.getByRole('button', { name: /DeckInspector.changePrinting/ }));
  fireEvent.click(inspector.getByRole('button', { name: /C21/ }));
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

it('follows the remaining sideboard printing and keeps panel focus when the main counter reaches zero', async () => {
  const inspector = await renderEditor([ring('sr-a'), ring('sr-a', 'sideboard')]);
  fireEvent.click(screen.getAllByRole('row')[0]);
  await userEvent.click(inspector.getByRole('button', { name: 'DeckInspector.decreaseMain' }));
  expect(inspector.queryByText('DeckInspector.empty')).not.toBeInTheDocument();
  expect(currentCards()).toEqual([ring('sr-a', 'sideboard')]);
  expect(inspector.getByRole('button', { name: 'DeckInspector.cardDetails' })).toHaveFocus();
  await userEvent.click(inspector.getByRole('button', { name: 'DeckInspector.increaseSide' }));
  expect(currentCards()[0].quantity).toBe(2);
});

it.each([false, true])('hands focus back to a deck row or the list after panel Remove (empty: %s)', async (empty) => {
  const next: DeckCard = { name: 'Another card', category: 'main', quantity: 1, lookupSource: 'unknown' };
  const inspector = await renderEditor(empty ? [ring('sr-a')] : [ring('sr-a'), next]);
  const removed = screen.getAllByRole('row').find((row) => within(row).queryByRole('button', { name: 'Sol Ring' }))!;
  const list = removed.closest('main')!;
  const remaining = screen.queryAllByRole('row').find((row) => within(row).queryByRole('button', { name: 'Another card' }));
  fireEvent.click(removed);
  await userEvent.click(inspector.getByRole('button', { name: 'DeckInspector.remove' }));
  expect(removed).not.toBeInTheDocument();
  expect(empty ? list : remaining).toHaveFocus();
});
