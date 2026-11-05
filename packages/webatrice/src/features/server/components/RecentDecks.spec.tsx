import { act, fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { useLocation } from 'react-router-dom';
import { server } from '@cockatrice/datatrice';
import { Response_DeckListSchema } from '@cockatrice/sockatrice/generated';

import { renderWithProviders, connectedState } from '../../../__test-utils__';
import type { RecentDeck } from '@app/services';
import RecentDecks from './RecentDecks';

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
  prefetchHook: vi.fn(),
  recent: [] as RecentDeck[],
}));

vi.mock('../../../RoutePrefetch', () => ({
  useDeckEditorRoutePrefetch: mocks.prefetchHook,
}));

vi.mock('@app/hooks', async (importOriginal) => ({
  ...await importOriginal<typeof import('@app/hooks')>(),
  useRecentDecks: () => mocks.recent,
}));

beforeEach(() => {
  mocks.prefetchHook.mockReturnValue(mocks.prefetch);
  mocks.recent = [{
    scope: 'ws://localhost:4748',
    owner: 'testUser',
    deckId: 7,
    name: 'Atraxa',
    format: 'commander',
    colors: 'WUBG',
    cardCount: 100,
    bracketLevel: 3,
    bannerCard: 'Atraxa',
    openedAt: 1,
  }];
});

it('registers idle prefetch and prefetches from a recent deck tile', () => {
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  expect(mocks.prefetchHook).toHaveBeenCalledTimes(1);
  const button = screen.getByText('Atraxa').closest('button')!;
  fireEvent.pointerEnter(button);
  fireEvent.focus(button);
  expect(mocks.prefetch).toHaveBeenCalledTimes(2);
});

it('uses the deck-page face with over-art identity and a family band containing the bracket', () => {
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  const button = screen.getByText('Atraxa').closest('button')!;
  const title = within(button).getByText('Atraxa');
  expect(title).toHaveClass('text-over-art-text', 'truncate', 'max-w-full');
  expect(title.parentElement).toHaveClass('flex-wrap', 'min-w-0');
  const pips = within(button).getByRole('img', { name: 'Decks.badge.identity' });
  expect(pips.parentElement).toBe(title.parentElement);
  expect(pips.children).toHaveLength(4);
  expect(title.parentElement?.parentElement?.querySelector('img')).toHaveAttribute('src', expect.stringContaining('Atraxa'));
  const band = within(button).getByText('DeckFormat.commander').parentElement;
  expect(band).toHaveClass('bg-format-commander');
  expect(within(band!).getByTitle('Decks.badge.bracket')).toHaveTextContent('Decks.badge.bracketShort');
  expect(within(button).getByText('DeckTile.cards')).toBeInTheDocument();
  expect(screen.queryByText('Decks.list.created')).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'DeckTile.tags' })).not.toBeInTheDocument();
  expect(screen.queryByTitle('Decks.badge.priceLoading')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'DeckActionsMenu.more' })).not.toBeInTheDocument();
});

it('lets a long title truncate and five identity pips wrap together on narrow lobby cards', () => {
  mocks.recent[0] = { ...mocks.recent[0], name: 'A very long five-colour deck title '.repeat(8), colors: 'WUBRG' };
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  const title = screen.getByText(mocks.recent[0].name.trim());
  expect(title).toHaveClass('max-w-full', 'truncate');
  expect(title.parentElement).toHaveClass('min-w-0', 'flex-wrap');
  const pips = within(title.parentElement!).getByRole('img');
  expect(pips).toHaveClass('shrink-0');
  expect(pips.children).toHaveLength(5);
});

it.each([
  ['PauperCommander', 'bg-format-commander'],
  ['pioneer', 'bg-format-modern'],
  ['standard', 'bg-format-standard'],
  ['vintage', 'bg-format-eternal'],
  ['pauper', 'bg-format-pauper'],
  ['custom', 'bg-format-other'],
  ['constructor', 'bg-format-other'],
  ['__proto__', 'bg-format-other'],
])('uses the model format family for %s', (format, band) => {
  mocks.recent[0].format = format;
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  expect(screen.getByTitle('Decks.badge.bracket').closest(`.${band}`)).not.toBeNull();
});

it('describes a recent deck without a format and keeps zero cards without a leading separator', () => {
  mocks.recent[0] = { ...mocks.recent[0], format: '', colors: '', cardCount: 0, bracketLevel: undefined };
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  expect(screen.getByText('Atraxa').closest('button')).toHaveAccessibleDescription('Decks.badge.noFormat');
  const cards = screen.getByText('DeckTile.cards');
  expect(cards).toHaveTextContent(/^DeckTile.cards$/);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('shows live creation time when the tree loads without fetching deck details', () => {
  const { store, webClient } = renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  expect(screen.queryByText('Decks.list.created')).not.toBeInTheDocument();
  act(() => store.dispatch(server.Actions.backendDecks({ deckList: create(Response_DeckListSchema, {
    root: { items: [{ name: 'Folder', folder: { items: [{
      id: 7, name: 'Renamed', file: { creationTime: Math.floor(Date.now() / 1000) },
    }] } }] },
  }) })));
  expect(screen.getByText('Renamed')).toBeInTheDocument();
  expect(screen.getByText('Decks.list.created')).toBeInTheDocument();
  expect(webClient.request.session.deckDownload).not.toHaveBeenCalled();
});

it('keeps the five most recent decks in equal desktop columns and allows smaller screens to wrap', () => {
  mocks.recent = Array.from({ length: 6 }, (_, index) => ({ ...mocks.recent[0], deckId: index, name: `Deck ${index}` }));
  renderWithProviders(<RecentDecks />, { preloadedState: connectedState });
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.queryByText('Deck 5')).not.toBeInTheDocument();
  expect(screen.getByRole('list')).toHaveClass('xl:grid-cols-5', 'grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))]');
  for (const button of screen.getAllByRole('button', { name: 'DeckTile.open' })) {
    expect(button).toHaveClass('min-w-0', 'w-full');
  }
});

it('opens the selected recent deck', () => {
  function Location() {
    return <output>{useLocation().pathname}</output>;
  }
  renderWithProviders(<><RecentDecks /><Location /></>, { preloadedState: connectedState });
  fireEvent.click(screen.getByRole('button', { name: 'DeckTile.open' }));
  expect(screen.getByText('/deck/7')).toBeInTheDocument();
});
