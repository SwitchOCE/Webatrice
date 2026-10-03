import { ZoneName } from '@cockatrice/sockatrice';
import { act, fireEvent, screen, within } from '@testing-library/react';
import {
  makeCard,
  makeGameEntry,
  makePlayerEntry,
  makePlayerProperties,
  makeZoneEntry,
} from '@cockatrice/datatrice/testing';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';

import { makeStoreState, makeUser, renderWithProviders } from '../../../../__test-utils__';
import { GameSelectionProvider } from '../../components/ui/GameSelectionContext';
import type { ZoneViewTarget } from '../../hooks/dialogs/gameDialogs.types';
import ZoneViewDialog from './ZoneViewDialog';

vi.mock('../../../../services/cards/cardCatalog', () => ({
  lookupCardsCached: vi.fn(async (names: string[]) =>
    new Map(names.map((name) => [name, { found: false, source: 'unknown', name, printings: [] }]))),
}));

const OPT = makeCard({ id: 7, name: 'Opt' });
const DURESS = makeCard({ id: 8, name: 'Duress' });

/** Player 1 (local, "Trajer") and player 2 ("Opp"), each with `zone`. */
type ZoneSpec = {
  name: NonNullable<Parameters<typeof makeZoneEntry>[0]['name']>;
  cards?: ServerInfo_Card[];
  cardCount: number;
  revealedCards?: ServerInfo_Card[];
};

function stateWith(zone: ZoneSpec) {
  const seat = (playerId: number, name: string) => {
    const entry = makeZoneEntry({ name: zone.name, cards: zone.cards ?? [], cardCount: zone.cardCount });
    entry.revealedCards = zone.revealedCards;
    return makePlayerEntry({
      properties: makePlayerProperties({ playerId, userInfo: makeUser({ name }) }),
      zones: { [zone.name]: entry },
    });
  };
  return makeStoreState({
    games: {
      games: {
        1: makeGameEntry({ localPlayerId: 1, players: { 1: seat(1, 'Trajer'), 2: seat(2, 'Opp') } }),
      },
    },
  });
}

function renderView(
  view: ZoneViewTarget,
  zone: Parameters<typeof stateWith>[0],
  options: Parameters<typeof renderWithProviders>[1] = {},
) {
  const handleClose = vi.fn();
  const result = renderWithProviders(<ZoneViewDialog view={view} handleClose={handleClose} />, {
    preloadedState: stateWith(zone),
    ...options,
  });
  return { handleClose, ...result };
}

function panel(title: RegExp): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest<HTMLElement>('.pointer-events-auto.resize')!;
}

function viewCards(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-card][data-card-id]'));
}

afterEach(() => {
  window.localStorage.clear();
});

describe('ZoneViewDialog', () => {
  it('lists a public zone under its owner\'s name', () => {
    renderView({ playerId: 1, zoneName: ZoneName.GRAVE }, { name: ZoneName.GRAVE, cards: [OPT, DURESS], cardCount: 2 });

    const view = panel(/^Graveyard — Trajer/);
    expect(viewCards(view).map((el) => el.dataset.cardId).sort()).toEqual(['7', '8']);
    expect(within(view).queryByRole('checkbox', { name: /shuffle when closing/i })).not.toBeInTheDocument();
  });

  it('lists the library\'s dump snapshot and passes its shuffle choice on close', () => {
    const { handleClose } = renderView(
      { playerId: 1, zoneName: ZoneName.DECK },
      { name: ZoneName.DECK, cardCount: 40, revealedCards: [makeCard({ id: 0, name: 'Island' })] },
    );
    const view = panel(/^Trajer's library/);
    expect(viewCards(view)).toHaveLength(1);
    const shuffle = within(view).getByRole('checkbox', { name: /shuffle when closing/i });
    expect(shuffle).toBeChecked();

    fireEvent.click(within(view).getByTitle('Close'));
    expect(handleClose).toHaveBeenLastCalledWith(true);

    fireEvent.click(shuffle);
    fireEvent.click(within(view).getByTitle('Close'));
    expect(handleClose).toHaveBeenLastCalledWith(false);
  });

  it('closes on Escape, from its search box too', () => {
    const { handleClose } = renderView(
      { playerId: 1, zoneName: ZoneName.GRAVE },
      { name: ZoneName.GRAVE, cards: [OPT], cardCount: 1 },
    );

    fireEvent.keyDown(within(panel(/^Graveyard/)).getByRole('textbox'), { key: 'Escape' });

    expect(handleClose).toHaveBeenCalledWith(false);
  });

  it('lists a top / bottom N view in server order, labelled by deck position', () => {
    const { handleClose } = renderView(
      { playerId: 1, zoneName: ZoneName.DECK, numberCards: 3, isReversed: true },
      {
        name: ZoneName.DECK,
        cardCount: 10,
        revealedCards: [7, 8, 9].map((id) => makeCard({ id, name: `C${id}` })),
      },
    );
    const view = panel(/^Bottom 3 cards — Trajer/);

    expect(viewCards(view).map((el) => el.dataset.cardId)).toEqual(['7', '8', '9']);
    expect(within(view).getByText('Bottom')).toBeInTheDocument();
    expect(within(view).getByText('7')).toBeInTheDocument();

    fireEvent.click(within(view).getAllByRole('button', { name: 'Close' })[0]);
    expect(handleClose).toHaveBeenCalledWith(false);
  });

  it('drags only the local player\'s own cards', () => {
    renderView({ playerId: 1, zoneName: ZoneName.GRAVE }, { name: ZoneName.GRAVE, cards: [OPT], cardCount: 1 });
    renderView({ playerId: 2, zoneName: ZoneName.GRAVE }, { name: ZoneName.GRAVE, cards: [OPT], cardCount: 1 });

    expect(viewCards(panel(/^Graveyard — Trajer/))[0]).toHaveStyle({ cursor: 'grab' });
    expect(viewCards(panel(/^Graveyard — Opp/))[0].style.cursor).toBe('');
  });

  it('opens the owning seat\'s card menu for a graveyard or exile card', () => {
    const openSeatCardMenu = vi.fn();
    renderView(
      { playerId: 2, zoneName: ZoneName.GRAVE },
      { name: ZoneName.GRAVE, cards: [OPT], cardCount: 1 },
      { gameDialogs: { openSeatCardMenu } },
    );

    fireEvent.contextMenu(viewCards(panel(/^Graveyard/))[0], { clientX: 5, clientY: 6 });

    expect(openSeatCardMenu).toHaveBeenCalledWith({
      kind: 'pile', playerId: 2, zone: ZoneName.GRAVE, cardId: '7', cardName: 'Opt', x: 5, y: 6,
    });
  });

  it('offers no card menu in a hand view', () => {
    const openSeatCardMenu = vi.fn();
    renderView(
      { playerId: 1, zoneName: ZoneName.HAND },
      { name: ZoneName.HAND, cards: [OPT], cardCount: 1 },
      { gameDialogs: { openSeatCardMenu } },
    );

    fireEvent.contextMenu(viewCards(panel(/^Hand/))[0]);

    expect(openSeatCardMenu).not.toHaveBeenCalled();
  });

  it('shows the game selection, and drops its own cards from it on close', () => {
    let keys: ReadonlySet<string> = new Set(['1-grave-7', '1-table-3']);
    const setSelectedCardKeys = vi.fn((next: ReadonlySet<string> | ((prev: ReadonlySet<string>) => ReadonlySet<string>)) => {
      keys = typeof next === 'function' ? next(keys) : next;
    });
    const { unmount } = renderWithProviders(
      <GameSelectionProvider selectedCardKeys={keys} setSelectedCardKeys={setSelectedCardKeys}>
        <ZoneViewDialog view={{ playerId: 1, zoneName: ZoneName.GRAVE }} handleClose={() => undefined} />
      </GameSelectionProvider>,
      { preloadedState: stateWith({ name: ZoneName.GRAVE, cards: [OPT, DURESS], cardCount: 2 }) },
    );
    const [first, second] = viewCards(panel(/^Graveyard/)).sort((a, b) => a.dataset.cardId!.localeCompare(b.dataset.cardId!));

    expect(first.style.boxShadow).not.toBe('');
    expect(second.style.boxShadow).toBe('');

    act(() => unmount());
    expect([...keys]).toEqual(['1-table-3']);
  });
});
