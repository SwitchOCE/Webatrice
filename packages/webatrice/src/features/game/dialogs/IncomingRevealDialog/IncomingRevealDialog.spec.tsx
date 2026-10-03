// The receiver-side reveal popup (refactor plan PB-14). Lent-library drags
// (the lender as the move's start player, battlefield-only drops, no drag for
// a spectator) are pinned in Game.dragdrop.spec.tsx.

import { act, fireEvent, screen, within } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';
import { makeCard } from '@cockatrice/datatrice/testing';
import { ShortcutProvider } from '@app/feature-widgets/shortcuts';

import { createMockWebClient, renderWithProviders } from '../../../../__test-utils__';
import { buildSeatGameState, chooseMenuPath, openMenus } from '../../__test-utils__/seatFixtures';
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

function renderReveal({ grantWriteAccess = false, zoneName = ZoneName.DECK as string } = {}) {
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
  preloadedState.games!.games![1]!.players![2]!.zones![zoneName]!.revealedCards = REVEALED;
  const webClient = createMockWebClient();
  const utils = renderWithProviders(<ShortcutProvider><Game /></ShortcutProvider>, { preloadedState, webClient, route: '/game/1' });
  const reveal = () => utils.store.getState().games;
  return { ...utils, reveal, game: webClient.request.game };
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

  describe('read-only reveal card menu', () => {
    function rightClick(name: string) {
      act(() => {
        fireEvent.contextMenu(within(popup()).getByTitle(name));
      });
    }

    it('Hide removes the card from this window only and sends nothing', () => {
      const { reveal, game } = renderReveal();
      rightClick('Island');
      chooseMenuPath('Hide');

      expect(within(popup()).queryByTitle('Island')).not.toBeInTheDocument();
      expect(within(popup()).getByTitle('Forest')).toBeInTheDocument();
      expect(openMenus()).toHaveLength(0);
      expect(reveal().games[1].players[2].zones[ZoneName.DECK].revealedCards).toEqual(REVEALED);
      for (const send of Object.values(game)) {
        expect(send).not.toHaveBeenCalled();
      }
    });

    it('Select All then Alt+H hides every card and keeps the window open', () => {
      renderReveal();
      rightClick('Forest');
      chooseMenuPath('Select All');
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', altKey: true, bubbles: true, cancelable: true }));
      });

      expect(within(popup()).queryByTitle('Island')).not.toBeInTheDocument();
      expect(within(popup()).queryByTitle('Forest')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'P2 reveals their library' })).toBeInTheDocument();
    });

    it('selects cards from the keyboard, so Alt+H can hide them', () => {
      renderReveal();
      const island = within(popup()).getByRole('button', { name: 'Island' });
      expect(island).toHaveAttribute('tabindex', '0');
      expect(island).toHaveAttribute('aria-pressed', 'false');

      fireEvent.keyDown(island, { key: ' ' });
      expect(island).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(within(popup()).getByRole('button', { name: 'Forest' }), { key: 'Enter' });
      fireEvent.keyDown(island, { key: 'Enter' });
      expect(island).toHaveAttribute('aria-pressed', 'false');

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', altKey: true, bubbles: true, cancelable: true }));
      });
      expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
      expect(within(popup()).queryByTitle('Forest')).not.toBeInTheDocument();
    });

    it('a new reveal shows its cards again', () => {
      const { store } = renderReveal();
      rightClick('Island');
      chooseMenuPath('Hide');

      act(() => {
        store.dispatch(games.Actions.incomingRevealShown({
          gameId: 1,
          sourceOwnerId: 2,
          zoneName: ZoneName.DECK,
          cards: REVEALED,
          grantWriteAccess: false,
        }));
      });

      expect(within(popup()).getByTitle('Island')).toBeInTheDocument();
    });

    it('a lent reveal has no card menu', () => {
      renderReveal({ grantWriteAccess: true });
      rightClick('Island');
      expect(openMenus()).toHaveLength(0);
    });
  });
});
