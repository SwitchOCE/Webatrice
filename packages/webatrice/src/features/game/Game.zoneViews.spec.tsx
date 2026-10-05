// The seat's zone views, end to end through <Game />: which menu opens which
// view, what each view shows, and the exact commands opening and closing it
// send. Phase 6 (PB-13) moves these views from PlayerBox into ZoneViewDialog;
// these assertions hold for both.

import { act, fireEvent, screen, within } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { ShortcutProvider } from '@app/feature-widgets/shortcuts';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import {
  battlefieldEl,
  buildSeatGameState,
  chooseMenuPath,
  openContextMenu,
  pileEl,
} from './__test-utils__/seatFixtures';
import Game from './Game';
import { lookupCardsCached } from '../../services/cards/catalog/lookup';

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

const DURESS = makeCard({ id: 40, name: 'Duress' });
const OPT = makeCard({ id: 41, name: 'Opt' });
const PATH = makeCard({ id: 50, name: 'Path' });
const SHOCK = makeCard({ id: 30, name: 'Shock' });
const THEIR_GRAVE = makeCard({ id: 60, name: 'Thoughtseize' });

function renderSeats(mutate?: (state: ReturnType<typeof buildSeatGameState>) => void) {
  const webClient = createMockWebClient();
  const preloadedState = buildSeatGameState({
    localPlayerId: 1,
    seats: [
      { playerId: 1, hand: [SHOCK], grave: [DURESS, OPT], exile: [PATH], deckCount: 10, sideboardCount: 2 },
      { playerId: 2, handCount: 5, grave: [THEIR_GRAVE], deckCount: 33 },
    ],
  });
  mutate?.(preloadedState);
  const { store } = renderWithProviders(<ShortcutProvider><Game /></ShortcutProvider>, {
    preloadedState,
    webClient,
    route: '/game/1',
  });
  return { game: webClient.request.game, store };
}

type Store = ReturnType<typeof renderSeats>['store'];

/** Lands a Response_DumpZone snapshot, as the dump command's response would. */
function dumpArrives(store: Store, zoneName: string, names: string[], isReversed = false) {
  act(() => {
    store.dispatch(games.Actions.zoneViewRevealed({
      gameId: 1,
      playerId: 1,
      zoneName,
      cards: names.map((name, i) => makeCard({ id: i, name })),
      isReversed,
    }));
  });
}

function revealedIn(store: Store, zoneName: string) {
  return store.getState().games.games[1].players[1].zones[zoneName].revealedCards;
}

/** Matches a view header: the title, then the header's own count if any. */
function titled(title: string): RegExp {
  return new RegExp(`^${title}`);
}

/** The floating view whose header reads `title`. */
function zoneView(title: string): HTMLElement {
  return screen.getByRole('heading', { name: titled(title) }).closest<HTMLElement>('.pointer-events-auto.resize')!;
}

// A card view's close button, or a reveal's.
function closeView(view: HTMLElement) {
  fireEvent.click(within(view).getAllByRole('button', { name: /^(ZoneViewPanel\.close|Close)$/ })[0]);
}

function answerCountPrompt(title: RegExp, value: string) {
  const dialog = screen.getByRole('dialog', { name: title });
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value } });
  act(() => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'View' }));
  });
}

const unknownCard = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });

afterEach(() => {
  window.localStorage.clear();
  vi.mocked(lookupCardsCached).mockImplementation(async (names: string[]) =>
    new Map(names.map((n) => [n, unknownCard(n)])) as Awaited<ReturnType<typeof lookupCardsCached>>);
});

describe('seat zone views', () => {
  it('View library dumps the whole library and lists the snapshot', () => {
    const { game, store } = renderSeats();

    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');

    expect(game.dumpZone).toHaveBeenCalledTimes(1);
    expect(game.dumpZone).toHaveBeenCalledWith(1, {
      playerId: 1,
      zoneName: ZoneName.DECK,
      numberCards: -1,
      isReversed: false,
    });
    dumpArrives(store, ZoneName.DECK, ['Island', 'Ponder']);
    const view = zoneView('P1\'s library');
    expect(view.querySelectorAll('[data-card][data-card-id]')).toHaveLength(2);
  });

  it('a library view card reveals to a player by its id', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island', 'Ponder']);

    const card = zoneView('P1\'s library').querySelector('[data-card][data-card-id="1"]')!;
    openContextMenu(card);
    chooseMenuPath('Reveal to...', 'P2');

    expect(game.revealCards).toHaveBeenCalledTimes(1);
    expect(game.revealCards).toHaveBeenCalledWith(1, { zoneName: ZoneName.DECK, cardId: [1], playerId: 2 });
  });

  it('closing the library view shuffles (on by default) and clears the snapshot', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island']);

    closeView(zoneView('P1\'s library'));

    expect(game.shuffle).toHaveBeenCalledTimes(1);
    expect(game.shuffle).toHaveBeenCalledWith(1, { zoneName: ZoneName.DECK, start: 0, end: -1 });
    expect(revealedIn(store, ZoneName.DECK)).toBeUndefined();
    expect(screen.queryByRole('heading', { name: /^P1's library/ })).not.toBeInTheDocument();
  });

  it('does not shuffle on close when "shuffle when closing" is unticked', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island']);
    const view = zoneView('P1\'s library');

    fireEvent.click(within(view).getByRole('checkbox', { name: 'ZoneViewPanel.shuffleOnClose' }));
    closeView(view);

    expect(game.shuffle).not.toHaveBeenCalled();
    expect(revealedIn(store, ZoneName.DECK)).toBeUndefined();
  });

  it('Escape in the search box closes the library view with exactly one shuffle', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island']);

    act(() => {
      fireEvent.keyDown(within(zoneView('P1\'s library')).getByRole('textbox'), { key: 'Escape' });
    });

    expect(screen.queryByRole('heading', { name: titled('P1\'s library') })).not.toBeInTheDocument();
    expect(game.shuffle).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the library view with exactly one shuffle', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island']);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    });

    expect(screen.queryByRole('heading', { name: /^P1's library/ })).not.toBeInTheDocument();
    expect(game.shuffle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['View top cards of library...', /^view top cards of library$/i, false, 'Top'],
    ['View bottom cards of library...', /^view bottom cards of library$/i, true, 'Bottom'],
  ] as const)('%s dumps N cards and lists them in server order', (item, prompt, isReversed, label) => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath(item);
    answerCountPrompt(prompt, '3');

    expect(game.dumpZone).toHaveBeenCalledWith(1, {
      playerId: 1,
      zoneName: ZoneName.DECK,
      numberCards: 3,
      isReversed,
    });
    dumpArrives(store, ZoneName.DECK, ['A', 'B', 'C'], isReversed);
    const view = zoneView(`${label} 3 cards — P1`);
    expect(view.querySelectorAll('[data-card][data-card-id]')).toHaveLength(3);

    closeView(view);
    expect(game.shuffle).not.toHaveBeenCalled();
    expect(revealedIn(store, ZoneName.DECK)).toBeUndefined();
  });

  // Desktop closes a library view through ZoneViewWidget::closeEvent, which
  // shuffles when "shuffle when closing" is set; a top-N view that takes the
  // whole-library view's place must not skip that close.
  it('View top cards over an open library view closes it with its shuffle first', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island', 'Ponder']);

    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View top cards of library...');
    answerCountPrompt(/^view top cards of library$/i, '3');

    expect(game.shuffle).toHaveBeenCalledTimes(1);
    expect(game.shuffle).toHaveBeenCalledWith(1, { zoneName: ZoneName.DECK, start: 0, end: -1 });
    expect(vi.mocked(game.shuffle).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(game.dumpZone).mock.invocationCallOrder[1]);
    expect(screen.queryByRole('heading', { name: titled('P1\'s library') })).not.toBeInTheDocument();
    expect(revealedIn(store, ZoneName.DECK)).toBeUndefined();
    dumpArrives(store, ZoneName.DECK, ['A', 'B', 'C']);
    expect(zoneView('Top 3 cards — P1')).toBeInTheDocument();
  });

  it('View top cards over a library view without "shuffle when closing" does not shuffle', () => {
    const { game, store } = renderSeats();
    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View library');
    dumpArrives(store, ZoneName.DECK, ['Island']);
    fireEvent.click(within(zoneView('P1\'s library')).getByRole('checkbox', { name: 'ZoneViewPanel.shuffleOnClose' }));

    openContextMenu(pileEl('Library', 0));
    chooseMenuPath('View top cards of library...');
    answerCountPrompt(/^view top cards of library$/i, '3');

    expect(game.shuffle).not.toHaveBeenCalled();
    expect(game.dumpZone).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Graveyard', 'View graveyard', 'ZoneLabel.title.grave — P1', 2],
    ['Exile', 'View exile', 'ZoneLabel.title.rfg — P1', 1],
    ['Hand', 'View hand', 'ZoneLabel.title.hand — P1', 1],
  ] as const)('%s view lists the public zone and sends nothing', (pile, item, title, count) => {
    const { game } = renderSeats();
    openContextMenu(pileEl(pile, 0));
    chooseMenuPath(item);

    const view = zoneView(title);
    expect(view.querySelectorAll('[data-card][data-card-id]')).toHaveLength(count);
    expect(within(view).queryByRole('checkbox', { name: 'ZoneViewPanel.shuffleOnClose' })).not.toBeInTheDocument();

    closeView(view);
    expect(screen.queryByRole('heading', { name: titled(title) })).not.toBeInTheDocument();
    expect(game.dumpZone).not.toHaveBeenCalled();
    expect(game.shuffle).not.toHaveBeenCalled();
  });

  it('opens an opponent\'s graveyard under their name', () => {
    renderSeats();
    openContextMenu(pileEl('Graveyard', 1));
    chooseMenuPath('View graveyard');

    expect(zoneView('ZoneLabel.title.grave — P2').querySelectorAll('[data-card][data-card-id]')).toHaveLength(1);
  });

  // Desktop closes a view when its zone is destroyed (ZoneViewZone::closed →
  // ZoneViewWidget::zoneDeleted); the seat's views used to unmount with it.
  it('closes a player\'s views when that player leaves, and keeps the others', () => {
    const { game, store } = renderSeats((state) => {
      state.games!.pings = { 1: { 1: 0, 2: 0 } };
    });
    openContextMenu(pileEl('Graveyard', 1));
    chooseMenuPath('View graveyard');
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    expect(zoneView('ZoneLabel.title.grave — P2')).toBeInTheDocument();

    act(() => {
      store.dispatch(games.Actions.playerLeft({ gameId: 1, playerId: 2, reason: 1, timeReceived: 0 }));
    });

    // A view whose player is gone falls back to "Player 2" with no cards.
    expect(screen.queryByRole('heading', { name: /^ZoneLabel\.title\.grave — (P2|Player 2)/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /^ZoneLabel\.title\.grave — / })).toHaveLength(1);
    expect(zoneView('ZoneLabel.title.grave — P1')).toBeInTheDocument();
    expect(game.shuffle).not.toHaveBeenCalled();
  });

  // Desktop keeps a view per zone (GameScene::toggleZoneView); the seat used to
  // hold one pile view, so a second replaced the first.
  it('keeps the graveyard and exile views open side by side', () => {
    renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    openContextMenu(pileEl('Exile', 0));
    chooseMenuPath('View exile');

    expect(zoneView('ZoneLabel.title.grave — P1')).toBeInTheDocument();
    expect(zoneView('ZoneLabel.title.rfg — P1')).toBeInTheDocument();
  });

  // Desktop's zone views are separate windows that never see the board's
  // Tab binding; the floating view is a non-modal dialog for the same reason.
  it('Tab on a card in a zone view moves focus, while Tab on a board card advances the phase', () => {
    const { game } = renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');

    const view = screen.getByRole('dialog', { name: 'ZoneLabel.title.grave — P1' });
    const viewCard = view.querySelector<HTMLElement>(`[data-card-id="${DURESS.id}"]`)!;
    const tab = fireEvent.keyDown(viewCard, { key: 'Tab', code: 'Tab' });
    expect(tab).toBe(true);
    expect(game.setActivePhase).not.toHaveBeenCalled();

    const handCard = document.querySelector<HTMLElement>(`[data-card-id="${SHOCK.id}"]`)!;
    act(() => {
      fireEvent.keyDown(handCard, { key: 'Tab', code: 'Tab' });
    });
    expect(game.setActivePhase).toHaveBeenCalledTimes(1);
  });

  it('the sideboard view dumps the sideboard and clears the snapshot on close', () => {
    const { game, store } = renderSeats();
    openContextMenu(battlefieldEl(1));
    chooseMenuPath('Sideboard', 'View sideboard');

    expect(game.dumpZone).toHaveBeenCalledWith(1, {
      playerId: 1,
      zoneName: ZoneName.SIDEBOARD,
      numberCards: -1,
      isReversed: false,
    });
    dumpArrives(store, ZoneName.SIDEBOARD, ['Duress', 'Negate']);
    const view = zoneView('ZoneLabel.title.sb — P1');
    expect(view.querySelectorAll('[data-card][data-card-id]')).toHaveLength(2);

    closeView(view);
    expect(revealedIn(store, ZoneName.SIDEBOARD)).toBeUndefined();
    expect(game.shuffle).not.toHaveBeenCalled();
  });
});

/** A card inside an open zone view (the board pile shows only its top card). */
function viewCard(view: HTMLElement, cardId: number): HTMLElement {
  return view.querySelector<HTMLElement>(`[data-card][data-card-id="${cardId}"]`)!;
}

function isHighlighted(el: HTMLElement): boolean {
  return el.style.boxShadow !== '';
}

describe('zone view card menu', () => {
  it('Clone sends one token copy of the right-clicked card', () => {
    const { game } = renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');

    openContextMenu(viewCard(zoneView('ZoneLabel.title.grave — P1'), DURESS.id));
    chooseMenuPath('Clone');

    expect(game.createToken).toHaveBeenCalledTimes(1);
    expect(game.createToken).toHaveBeenCalledWith(1, {
      zone: ZoneName.TABLE,
      cardName: 'Duress',
      cardProviderId: DURESS.providerId,
      color: '',
      pt: '',
      annotation: '',
      destroyOnZoneChange: true,
      x: -1,
      y: 0,
    });
  });

  // GAME-018: Select All / Select Column select through the game selection,
  // and Clone then applies to the selection (desktop aClone over the selected
  // cards).
  it('Select All selects every card the view shows; Clone then clones each', () => {
    const { game } = renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    const view = zoneView('ZoneLabel.title.grave — P1');

    openContextMenu(viewCard(view, DURESS.id));
    chooseMenuPath('Select All');

    expect(isHighlighted(viewCard(view, DURESS.id))).toBe(true);
    expect(isHighlighted(viewCard(view, OPT.id))).toBe(true);

    openContextMenu(viewCard(view, OPT.id));
    chooseMenuPath('Clone');
    expect(vi.mocked(game.createToken).mock.calls.map(([, params]) => params.cardName).sort()).toEqual(['Duress', 'Opt']);
  });

  it('Select Column selects the clicked card\'s column only', async () => {
    vi.mocked(lookupCardsCached).mockImplementation(async (names: string[]) =>
      new Map(names.map((name) => [name, {
        found: true,
        source: 'scryfall',
        name,
        typeLine: name === 'Opt' ? 'Instant' : 'Sorcery',
        printings: [],
      }])) as Awaited<ReturnType<typeof lookupCardsCached>>);
    renderSeats();
    openContextMenu(pileEl('Graveyard', 0));
    chooseMenuPath('View graveyard');
    const view = zoneView('ZoneLabel.title.grave — P1');
    await within(view).findByText(/^Sorcery/);

    openContextMenu(viewCard(view, DURESS.id));
    chooseMenuPath('Select Column');

    expect(isHighlighted(viewCard(view, DURESS.id))).toBe(true);
    expect(isHighlighted(viewCard(view, OPT.id))).toBe(false);
  });
});
