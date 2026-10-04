// The receiver-side reveal popup (refactor plan PB-14). Lent-library drags
// (the lender as the move's start player, battlefield-only drops, no drag for
// a spectator) are pinned in Game.dragdrop.spec.tsx.

import { fireEvent, screen, within } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../../../__test-utils__';
import { catalogT } from '../../__test-utils__/catalogT';
import { buildSeatGameState } from '../../__test-utils__/seatFixtures';
import Game from '../../Game';
import zoneLabels from '../shared/zoneLabels.i18n.json';
import { incomingRevealTitle } from './IncomingRevealDialog';

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
  // null: no snapshot was seeded.
  snapshot = REVEALED as typeof REVEALED | null,
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
  preloadedState.games!.games![1]!.players![2]!.zones![zoneName]!.revealedCards = snapshot ?? undefined;
  const utils = renderWithProviders(<Game />, { preloadedState, webClient: createMockWebClient() });
  const reveal = () => utils.store.getState().games;
  return { ...utils, reveal };
}

// The test i18n has no catalogue, so the zone reads as its key; incomingRevealTitle's spec pins
// the English.
const TITLE = /reveals their/;

function popup() {
  return screen.getByRole('heading', { name: TITLE }).closest<HTMLElement>('.pointer-events-auto')!;
}

describe('IncomingRevealDialog', () => {
  it('names the sender and the zone and shows every revealed card', () => {
    renderReveal();

    expect(screen.getByRole('heading', { name: 'P2 reveals their ZoneLabel.inline.deck' })).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { reveal } = renderReveal({ zoneName: ZoneName.HAND });
    expect(screen.getByRole('heading', { name: 'P2 reveals their ZoneLabel.inline.hand' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(reveal().incomingReveal).toBeNull();
  });

  it('lists the sender’s live snapshot rather than the first payload', () => {
    renderReveal({ snapshot: [REVEALED[0]] });
    expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
    expect(within(popup()).queryByTitle('Forest')).not.toBeInTheDocument();
  });

  it('shows no cards when the snapshot was emptied or never seeded', () => {
    const { unmount } = renderReveal({ snapshot: [] });
    expect(within(popup()).getByText('No cards to show.')).toBeInTheDocument();
    unmount();

    renderReveal({ snapshot: null });
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

    it('restores a stored size, clamped between its minimum and the viewport', () => {
      window.localStorage.setItem('webatrice.incomingRevealSize', JSON.stringify({ w: 5000, h: 100 }));
      renderReveal();
      expect(popup().style.width).toBe(`${window.innerWidth}px`);
      expect(popup().style.height).toBe('300px');
    });

    it('restores a stored position, keeping 60px of its header on screen', () => {
      window.localStorage.setItem('webatrice.incomingRevealPosition', JSON.stringify({ x: 5000, y: -40 }));
      renderReveal();
      expect(popup().style.left).toBe(`${window.innerWidth - 60}px`);
      expect(popup().style.top).toBe('0px');
    });
  });
});

describe('incomingRevealTitle', () => {
  const englishT = catalogT(zoneLabels);

  it('names the sender and the zone, in lower case', () => {
    expect(incomingRevealTitle(englishT, 'P2', ZoneName.DECK)).toBe('P2 reveals their library');
    expect(incomingRevealTitle(englishT, 'P2', ZoneName.HAND)).toBe('P2 reveals their hand');
    expect(incomingRevealTitle(englishT, 'P2', ZoneName.EXILE)).toBe('P2 reveals their exile');
    expect(incomingRevealTitle(englishT, undefined, ZoneName.GRAVE)).toBe('A player reveals their graveyard');
  });
});
