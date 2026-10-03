// The game's one card-preview owner (PB-19): every seat leaf publishes to the
// store Game provides, and the right-rail preview and the middle-click zoom read
// it. Rendered through <Game /> so the provider wiring itself is under test.

import { act, fireEvent, screen } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import { buildSeatGameState, cardEl, type SeatGameSpec } from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/catalog/lookup', () => {
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
});

const BOLT = makeCard({ id: 10, name: 'Lightning Bolt', x: 0, y: 0, pt: '3/1' });

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  activePlayerId: 1,
  seats: [
    { playerId: 1, table: [BOLT], deckCount: 40 },
    { playerId: 2, deckCount: 40 },
  ],
};

function previewImages(): HTMLImageElement[] {
  const pane = screen.getByText('Preview').closest('.shrink-0');
  return Array.from(pane?.querySelectorAll('img') ?? []);
}

describe('Game card preview', () => {
  beforeEach(() => {
    // Scryfall detail fetches stay pending; the image URLs are what we assert on.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a hovered seat card in the right-rail preview', () => {
    renderWithProviders(<Game />, { preloadedState: buildSeatGameState(SPEC), webClient: createMockWebClient() });
    expect(previewImages()).toHaveLength(0);

    const face = cardEl(BOLT.id, 'battlefield').querySelector('[title="Lightning Bolt"]');
    expect(face).not.toBeNull();
    fireEvent.mouseEnter(face!);

    expect(previewImages().map((img) => img.getAttribute('src'))).toEqual([
      expect.stringContaining(`exact=${encodeURIComponent('Lightning Bolt')}`),
    ]);
  });

  it('holds the middle-click zoom open until the middle button is released', () => {
    renderWithProviders(<Game />, { preloadedState: buildSeatGameState(SPEC), webClient: createMockWebClient() });
    const face = cardEl(BOLT.id, 'battlefield').querySelector('[title="Lightning Bolt"]')!;
    const zoomed = () => document.querySelector('.z-\\[1400\\]');

    act(() => {
      fireEvent.mouseDown(face, { button: 1 });
    });
    expect(zoomed()).not.toBeNull();
    expect(zoomed()).toHaveTextContent('Lightning Bolt');

    act(() => {
      fireEvent.mouseUp(window, { button: 0 });
    });
    expect(zoomed()).not.toBeNull();

    act(() => {
      fireEvent.mouseUp(window, { button: 1 });
    });
    expect(zoomed()).toBeNull();
  });

  it('closes the zoom with the game', () => {
    const { unmount } = renderWithProviders(<Game />, {
      preloadedState: buildSeatGameState(SPEC),
      webClient: createMockWebClient(),
    });
    act(() => {
      fireEvent.mouseDown(cardEl(BOLT.id, 'battlefield').querySelector('[title="Lightning Bolt"]')!, { button: 1 });
    });
    expect(document.querySelector('.z-\\[1400\\]')).not.toBeNull();

    unmount();
    expect(document.querySelector('.z-\\[1400\\]')).toBeNull();
  });
});
