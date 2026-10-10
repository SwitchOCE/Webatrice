import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { connected31State, createMockWebClient, renderWithProviders } from '../../__test-utils__';
import DeckEditor from './DeckEditor';
import { clearDeckEditorCache, setCachedDeck } from './deckEditorCache';
import { deckSaveSignature } from './deckPersistence';
import { PREVIEW_LEAVE_DELAY_MS } from './hooks/useInspectorPreview';
import type { DeckCard, HydratedDeck } from './types';

const card = (name: string, category: DeckCard['category'] = 'main', typeLine = 'Instant'): DeckCard =>
  ({ name, quantity: 1, category, typeLine, lookupSource: 'scryfall' });

beforeEach(() => clearDeckEditorCache());
afterEach(() => {
  clearDeckEditorCache();
  vi.useRealTimers();
});

async function renderEditor() {
  const deck: HydratedDeck = {
    name: 'Preview',
    format: 'standard',
    cards: [card('Ponder'), card('Opt'), card('Duress', 'sideboard', 'Sorcery')],
    meta: { v: 1, updatedAt: '' },
  };
  setCachedDeck(5, { deck, savedSignature: deckSaveSignature(deck) });
  renderWithProviders(
    <Routes><Route path="/deck/:deckId" element={<DeckEditor />} /></Routes>,
    { route: '/deck/5', preloadedState: connected31State, webClient: createMockWebClient() },
  );
  fireEvent.click(await screen.findByRole('button', { name: 'DeckEditor.inspector.toggle' }));
  return within(screen.getByRole('region', { name: 'DeckInspector.title' }));
}

const rowOf = (name: string) => screen.getAllByRole('row').find((row) => within(row).queryByRole('button', { name }))!;

describe('DeckEditor inspector preview', () => {
  it('previews a hovered row and returns to the clicked card when the pointer leaves', async () => {
    const inspector = await renderEditor();
    fireEvent.click(rowOf('Ponder'));
    expect(inspector.getByText('Ponder')).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.pointerEnter(rowOf('Duress'));
    expect(inspector.getByText('Duress')).toBeInTheDocument();
    expect(inspector.getByText('Sorcery')).toBeInTheDocument();

    fireEvent.pointerLeave(rowOf('Duress'));
    act(() => vi.advanceTimersByTime(PREVIEW_LEAVE_DELAY_MS));
    expect(inspector.getByText('Ponder')).toBeInTheDocument();
    expect(inspector.queryByText('Duress')).not.toBeInTheDocument();
  });

  it('shows the selected card again as soon as the pointer reaches the inspector', async () => {
    const inspector = await renderEditor();
    fireEvent.click(rowOf('Ponder'));
    fireEvent.pointerEnter(rowOf('Opt'));
    expect(inspector.getByText('Opt')).toBeInTheDocument();

    fireEvent.pointerEnter(screen.getByRole('complementary', { name: 'DeckEditor.inspector.label' }));
    expect(inspector.getByText('Ponder')).toBeInTheDocument();
  });

  it('previews a row reached with the keyboard', async () => {
    const inspector = await renderEditor();
    fireEvent.focus(rowOf('Opt'));
    expect(inspector.getByText('Opt')).toBeInTheDocument();
  });
});
