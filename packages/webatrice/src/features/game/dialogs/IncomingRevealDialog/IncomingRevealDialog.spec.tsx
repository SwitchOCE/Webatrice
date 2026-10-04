// The receiver-side reveal popup (refactor plan PB-14). Lent-library drags
// (the lender as the move's start player, battlefield-only drops, no drag for
// a spectator) are pinned in Game.dragdrop.spec.tsx.

import { fireEvent, screen, within } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../../../__test-utils__';
import { buildSeatGameState } from '../../__test-utils__/seatFixtures';
import Game from '../../Game';

vi.mock('../../../../hooks/useSettings');

vi.mock('../../../../services/cards/cardCatalog', () => {
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

const REVEALED = [makeCard({ id: 0, name: 'Island' }), makeCard({ id: 1, name: 'Forest' })];

function renderReveal({
  grantWriteAccess = false,
  zoneName = ZoneName.DECK as string,
  snapshot = REVEALED as typeof REVEALED | undefined,
} = {}) {
  const preloadedState = buildSeatGameState({
    localPlayerId: 1,
    seats: [
      { playerId: 1, deckCount: 40 },
      { playerId: 2, deckCount: 30, handCount: 7 },
    ],
  });
  preloadedState.games = {
    ...preloadedState.games!,
    incomingReveal: { gameId: 1, sourceOwnerId: 2, zoneName, cards: REVEALED, grantWriteAccess },
  } as typeof preloadedState.games;
  preloadedState.games!.games![1]!.players![2]!.zones![zoneName]!.revealedCards = snapshot;
  const utils = renderWithProviders(<Game />, { preloadedState, webClient: createMockWebClient() });
  const reveal = () => utils.store.getState().games;
  return { ...utils, reveal };
}

function popup() {
  return screen.getByRole('heading', { name: /reveals their/ }).closest<HTMLElement>('.pointer-events-auto')!;
}

describe('IncomingRevealDialog', () => {
  it('names the sender and the zone and shows every revealed card', () => {
    renderReveal();

    expect(screen.getByRole('heading', { name: 'P2 reveals their library' })).toBeInTheDocument();
    expect(within(popup()).getByText(/^2 cards/)).toBeInTheDocument();
    expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
    expect(within(popup()).getByTitle('Forest')).toBeInTheDocument();
  });

  it('says when the sender lent the zone', () => {
    renderReveal({ grantWriteAccess: true });
    expect(within(popup()).getByText(/write access granted/)).toBeInTheDocument();
  });

  it('dismisses the reveal and clears the sender’s snapshot on close', () => {
    const { reveal } = renderReveal();

    // The header's close button (the first; card previews add their own).
    fireEvent.click(within(popup()).getAllByRole('button', { name: 'Close' })[0]);

    expect(reveal().incomingReveal).toBeNull();
    expect(reveal().games[1].players[2].zones[ZoneName.DECK].revealedCards ?? []).toEqual([]);
    expect(screen.queryByRole('heading', { name: /reveals their/ })).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { reveal } = renderReveal({ zoneName: ZoneName.HAND });
    expect(screen.getByRole('heading', { name: 'P2 reveals their hand' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(reveal().incomingReveal).toBeNull();
  });

  it('lists the sender’s live snapshot rather than the first payload', () => {
    renderReveal({ snapshot: [REVEALED[0]] });
    expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
    expect(within(popup()).queryByTitle('Forest')).not.toBeInTheDocument();
  });

  it('falls back to the first payload when no snapshot was seeded, and shows an emptied one as empty', () => {
    const { unmount } = renderReveal({ snapshot: undefined });
    expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
    expect(within(popup()).getByTitle('Forest')).toBeInTheDocument();
    unmount();

    renderReveal({ snapshot: [] });
    expect(within(popup()).getByText('No cards to show.')).toBeInTheDocument();
  });

  it('says it is loading until the catalog answers, then groups by type', async () => {
    renderReveal();
    expect(within(popup()).getByText('Loading card details…')).toBeInTheDocument();
    expect(await within(popup()).findByText('Other')).toBeInTheDocument();
    expect(within(popup()).queryByText('Loading card details…')).not.toBeInTheDocument();
  });

  describe('its own stored choices', () => {
    afterEach(() => {
      window.localStorage.clear();
    });

    it('restores and stores the group, sort and pile choices under their own keys', async () => {
      window.localStorage.setItem('webatrice.incomingRevealGroupBy', 'none');
      window.localStorage.setItem('webatrice.searchLibraryGroupBy', 'cmc');
      renderReveal();
      await within(popup()).findAllByTitle('Island');
      expect(within(popup()).getByTitle('Group by')).toHaveValue('none');
      expect(within(popup()).getByRole('checkbox', { name: /pile view/ })).toBeDisabled();

      fireEvent.change(within(popup()).getByTitle('Sort by'), { target: { value: 'set' } });
      expect(window.localStorage.getItem('webatrice.incomingRevealSortBy')).toBe('set');
      expect(window.localStorage.getItem('webatrice.searchLibrarySortBy')).toBeNull();
    });

    it('opens at 900×520 unless a size is stored', () => {
      const { unmount } = renderReveal();
      expect(popup().style.width).toBe('900px');
      expect(popup().style.height).toBe('520px');
      unmount();

      window.localStorage.setItem('webatrice.incomingRevealSize', JSON.stringify({ w: 640, h: 480 }));
      renderReveal();
      expect(popup().style.width).toBe('640px');
      expect(popup().style.height).toBe('480px');
    });

    it('restores a stored position, kept on screen', () => {
      window.localStorage.setItem('webatrice.incomingRevealPosition', JSON.stringify({ x: 5000, y: -40 }));
      renderReveal();
      // jsdom lays nothing out, so the dialog measures 0×0.
      expect(popup().style.left).toBe(`${window.innerWidth}px`);
      expect(popup().style.top).toBe('0px');
    });
  });
});
