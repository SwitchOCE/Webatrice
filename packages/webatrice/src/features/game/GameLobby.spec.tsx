import { act, fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { games } from '@cockatrice/datatrice';
import {
  makeGameEntry,
  makePlayerEntry,
  makePlayerProperties,
} from '@cockatrice/datatrice/testing';
import type { WebClient } from '@cockatrice/sockatrice';
import { Response_ResponseCode, ServerInfo_PlayerPropertiesSchema } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import {
  connectedWithRoomsState,
  createMockWebClient,
  makeStoreState,
  renderWithProviders,
} from '../../__test-utils__';
import GameLobby from './GameLobby';

const DECK = `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_deck version="1">
  <deckname>Burn</deckname>
  <zone name="main"><card number="2" name="Lightning Bolt"/><card number="1" name="Mountain"/></zone>
  <zone name="side"><card number="1" name="Smash to Smithereens"/></zone>
</cockatrice_deck>`;

// The current plan (`<sideboard_plan><name></name>`) moves the Mountain to the sideboard.
const WITH_PLAN = DECK.replace(
  '</cockatrice_deck>',
  '<sideboard_plan><name></name><move_card_to_zone><card_name>Mountain</card_name>'
    + '<start_zone>main</start_zone><target_zone>side</target_zone></move_card_to_zone></sideboard_plan></cockatrice_deck>',
);

interface LobbySpec {
  hostId?: number;
  deckList?: string;
  ready?: boolean;
  sideboardLocked?: boolean;
  opponentReady?: boolean;
}

function lobbyState({
  hostId = 1,
  deckList = DECK,
  ready = false,
  sideboardLocked = true,
  opponentReady = false,
}: LobbySpec = {}) {
  return makeStoreState({
    ...connectedWithRoomsState,
    server: { ...connectedWithRoomsState.server, backendDecks: { root: { items: [] } } },
    games: {
      games: {
        1: makeGameEntry({
          hostId,
          localPlayerId: 1,
          started: false,
          players: {
            1: makePlayerEntry({
              deckList,
              properties: makePlayerProperties({
                playerId: 1,
                deckHash: deckList ? 'abc' : '',
                readyStart: ready,
                sideboardLocked,
                userInfo: { name: 'Alice' },
              }),
            }),
            2: makePlayerEntry({
              properties: makePlayerProperties({
                playerId: 2,
                readyStart: opponentReady,
                userInfo: { name: 'Bob' },
              }),
            }),
          },
          seatOrder: [1, 2],
        }),
      },
    },
  });
}

function renderLobby(spec?: LobbySpec) {
  const webClient = createMockWebClient() as unknown as WebClient;
  const utils = renderWithProviders(<GameLobby gameId={1} />, { preloadedState: lobbyState(spec), webClient });
  return { ...utils, webClient };
}

// Event_PlayerPropertiesChanged for the local player's sideboard lock.
const setLocalSideboardLock = (sideboardLocked: boolean) => games.Actions.playerPropertiesChanged({
  gameId: 1,
  playerId: 1,
  properties: create(ServerInfo_PlayerPropertiesSchema, { sideboardLocked }),
});

const button = (name: string) => screen.getByRole('button', { name });

describe('GameLobby — force start (GAME-013)', () => {
  it('asks for confirmation, then sends ONE readyStart{ready, forceStart} and no kicks', () => {
    const { webClient } = renderLobby({ hostId: 1 });

    fireEvent.click(button('GameLobby.action.forceStart'));
    expect(webClient.request.game.readyStart).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('GameLobby.forceStart.title')).toBeInTheDocument();
    expect(within(dialog).getByText('GameLobby.forceStart.message')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'GameLobby.forceStart.confirm' }));
    expect(webClient.request.game.readyStart).toHaveBeenCalledTimes(1);
    expect(webClient.request.game.readyStart).toHaveBeenCalledWith(1, { ready: true, forceStart: true });
    expect(webClient.request.game.kickFromGame).not.toHaveBeenCalled();
  });

  it('sends nothing when the confirmation is declined', () => {
    const { webClient } = renderLobby({ hostId: 1 });
    fireEvent.click(button('GameLobby.action.forceStart'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'GameLobby.forceStart.cancel' }));
    expect(webClient.request.game.readyStart).not.toHaveBeenCalled();
  });

  it('is offered to an unready host (the server readies the host as part of the force start)', () => {
    renderLobby({ hostId: 1, ready: false, opponentReady: false });
    expect(button('GameLobby.action.forceStart')).toBeEnabled();
  });

  it('is hidden from non-hosts and before a deck is loaded (desktop deck-select state)', () => {
    renderLobby({ hostId: 2 });
    expect(screen.queryByRole('button', { name: 'GameLobby.action.forceStart' })).not.toBeInTheDocument();
  });
});

describe('GameLobby — deck states (GAME-014)', () => {
  it('unload cancels a ready command even before its echo arrives', () => {
    const { webClient } = renderLobby({ ready: false });
    fireEvent.click(button('GameLobby.action.readyStart'));
    fireEvent.click(button('GameLobby.action.unloadDeck'));
    expect(webClient.request.game.readyStart).toHaveBeenNthCalledWith(1, 1, { ready: true });
    expect(webClient.request.game.readyStart).toHaveBeenNthCalledWith(2, 1, { ready: false });
  });

  it('keeps the unloaded view across route navigation and observes deck selection while away', () => {
    const { rerender, store } = renderLobby();
    fireEvent.click(button('GameLobby.action.unloadDeck'));
    rerender(<div>Another route</div>);
    rerender(<GameLobby gameId={1} />);
    expect(screen.queryByTestId('lobby-deck-view')).not.toBeInTheDocument();
    rerender(<div>Another route</div>);
    act(() => {
      store.dispatch(games.Actions.deckSelected({ gameId: 1, deckList: DECK }));
    });
    rerender(<GameLobby gameId={1} />);
    expect(screen.getByTestId('lobby-deck-view')).toBeInTheDocument();
  });

  it('without a deck shows the deck picker and none of the deck-loaded buttons', () => {
    renderLobby({ deckList: '' });
    expect(screen.getByText('Upload a .cod file')).toBeInTheDocument();
    for (const name of [
      'GameLobby.action.readyStart',
      'GameLobby.action.sideboardLocked',
      'GameLobby.action.unloadDeck',
      'GameLobby.action.forceStart',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('titles the deck area with a translated heading in both states', () => {
    renderLobby();
    expect(screen.getByText('GameLobby.deck.heading')).toBeInTheDocument();
  });

  it('with a deck shows Maindeck / Sideboard and hides the picker', () => {
    renderLobby();
    expect(screen.getByRole('heading', { name: 'GameLobby.deck.maindeck' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GameLobby.deck.sideboard' })).toBeInTheDocument();
    expect(within(screen.getByTestId('lobby-deck-main')).getByText('Lightning Bolt')).toBeInTheDocument();
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Smash to Smithereens')).toBeInTheDocument();
    expect(screen.queryByText('Upload a .cod file')).not.toBeInTheDocument();
  });

  it('Ready to start toggles readyStart', () => {
    const { webClient } = renderLobby({ ready: true });
    const ready = button('GameLobby.action.readyStart');
    expect(ready).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(ready);
    expect(webClient.request.game.readyStart).toHaveBeenCalledWith(1, { ready: false });
  });

  it('Unload deck returns to the picker and un-readies a ready player', () => {
    const { webClient } = renderLobby({ ready: true });
    fireEvent.click(button('GameLobby.action.unloadDeck'));
    expect(webClient.request.game.readyStart).toHaveBeenCalledWith(1, { ready: false });
    expect(screen.getByText('Upload a .cod file')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-deck-view')).not.toBeInTheDocument();
  });

  it('a deck-select response re-enters the deck-loaded state after an unload', () => {
    const { store } = renderLobby();
    fireEvent.click(button('GameLobby.action.unloadDeck'));
    expect(screen.queryByTestId('lobby-deck-view')).not.toBeInTheDocument();
    act(() => {
      store.dispatch(games.Actions.deckSelected({ gameId: 1, deckList: DECK }));
    });
    expect(screen.getByTestId('lobby-deck-view')).toBeInTheDocument();
  });

  it('a failed deck select keeps the picker and says why', () => {
    const { store } = renderLobby({ deckList: '' });
    act(() => {
      store.dispatch(games.Actions.deckSelectFailed({ gameId: 1, responseCode: Response_ResponseCode.RespContextError }));
    });
    // Reported under the deck heading, not inside the .cod upload card.
    expect(screen.getByRole('alert')).toHaveTextContent('GameLobby.deckSelectFailed');
    expect(screen.queryByTestId('lobby-deck-view')).not.toBeInTheDocument();
  });

  it('reports a deck select the server never answered with the transport reason', () => {
    const { store } = renderLobby({ deckList: '' });
    act(() => {
      store.dispatch(games.Actions.deckSelectFailed({
        gameId: 1,
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });
    expect(screen.queryByText('GameLobby.deckSelectFailed')).not.toBeInTheDocument();
    expect(screen.getByText('CommandFailure.timeout')).toBeInTheDocument();
  });

  it('ignores a failed deck select for another game', () => {
    const { store } = renderLobby({ deckList: '' });
    act(() => {
      store.dispatch(games.Actions.deckSelectFailed({ gameId: 2, responseCode: Response_ResponseCode.RespContextError }));
    });
    expect(screen.queryByText('GameLobby.deckSelectFailed')).not.toBeInTheDocument();
  });
});

describe('GameLobby — sideboarding before ready (GAME-014)', () => {
  it('preserves the complete plan when returning to a route and moving another card', () => {
    const { webClient, rerender } = renderLobby({ sideboardLocked: false });
    fireEvent.click(screen.getByRole('button', { name: '2 Lightning Bolt' }));
    rerender(<div>Another route</div>);
    rerender(<GameLobby gameId={1} />);
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Lightning Bolt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1 Smash to Smithereens' }));
    expect(webClient.request.game.setSideboardPlan).toHaveBeenLastCalledWith(1, {
      moveList: [
        { cardName: 'Smash to Smithereens', startZone: 'side', targetZone: 'main' },
        { cardName: 'Lightning Bolt', startZone: 'main', targetZone: 'side' },
      ],
    });
  });

  it('keeps lock resets received while away, including a same-deck reselection', () => {
    const { store, rerender } = renderLobby({ deckList: WITH_PLAN, sideboardLocked: false });
    rerender(<div>Another route</div>);
    act(() => {
      store.dispatch(setLocalSideboardLock(true));
    });
    rerender(<GameLobby gameId={1} />);
    expect(within(screen.getByTestId('lobby-deck-side')).queryByText('Mountain')).not.toBeInTheDocument();
    rerender(<div>Another route</div>);
    act(() => {
      store.dispatch(games.Actions.deckSelected({ gameId: 1, deckList: WITH_PLAN }));
    });
    rerender(<GameLobby gameId={1} />);
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Mountain')).toBeInTheDocument();
  });

  it('isolates plans and unloaded state between games with identical decks', () => {
    const state = lobbyState({ sideboardLocked: false });
    state.games.games[2] = { ...state.games.games[1] };
    const { rerender } = renderWithProviders(<GameLobby gameId={1} />, { preloadedState: state });
    fireEvent.click(screen.getByRole('button', { name: '2 Lightning Bolt' }));
    rerender(<GameLobby gameId={2} />);
    expect(within(screen.getByTestId('lobby-deck-side')).queryByText('Lightning Bolt')).not.toBeInTheDocument();
    fireEvent.click(button('GameLobby.action.unloadDeck'));
    rerender(<GameLobby gameId={1} />);
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Lightning Bolt')).toBeInTheDocument();
  });

  it('while locked, cards cannot move and the lock button unlocks', () => {
    const { webClient } = renderLobby({ sideboardLocked: true });
    const main = screen.getByTestId('lobby-deck-main');
    for (const row of within(main).getAllByRole('button')) {
      expect(row).toBeDisabled();
    }
    const lock = button('GameLobby.action.sideboardLocked');
    // The changing label carries the state; aria-pressed on top would contradict it.
    expect(lock).not.toHaveAttribute('aria-pressed');
    fireEvent.click(lock);
    expect(webClient.request.game.setSideboardLock).toHaveBeenCalledWith(1, { locked: false });
  });

  it('names each row by its count and card, describing the move only while it is possible', () => {
    renderLobby({ sideboardLocked: false });
    const bolt = screen.getByRole('button', { name: '2 Lightning Bolt' });
    expect(bolt).toHaveAccessibleDescription('GameLobby.deck.moveToSideboard');
  });

  it('a locked row keeps its count and card name and offers no move', () => {
    renderLobby({ sideboardLocked: true });
    const bolt = screen.getByRole('button', { name: '2 Lightning Bolt' });
    expect(bolt).toHaveAccessibleDescription('');
  });

  it('while unlocked, moving a card sends the whole plan in deck zones (main/side)', () => {
    const { webClient } = renderLobby({ sideboardLocked: false });
    const boltRow = within(screen.getByTestId('lobby-deck-main')).getByText('Lightning Bolt').closest('button')!;
    fireEvent.click(boltRow);
    expect(webClient.request.game.setSideboardPlan).toHaveBeenLastCalledWith(1, {
      moveList: [{ cardName: 'Lightning Bolt', startZone: 'main', targetZone: 'side' }],
    });
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Lightning Bolt')).toBeInTheDocument();

    const smashRow = within(screen.getByTestId('lobby-deck-side')).getByText('Smash to Smithereens').closest('button')!;
    fireEvent.click(smashRow);
    expect(webClient.request.game.setSideboardPlan).toHaveBeenLastCalledWith(1, {
      moveList: [
        { cardName: 'Smash to Smithereens', startZone: 'side', targetZone: 'main' },
        { cardName: 'Lightning Bolt', startZone: 'main', targetZone: 'side' },
      ],
    });
  });

  it('readying locks editing and disables the sideboard lock button', () => {
    const { webClient } = renderLobby({ sideboardLocked: false, ready: true });
    expect(button('GameLobby.action.sideboardUnlocked')).toBeDisabled();
    const boltRow = within(screen.getByTestId('lobby-deck-main')).getByText('Lightning Bolt').closest('button')!;
    expect(boltRow).toBeDisabled();
    fireEvent.click(boltRow);
    expect(webClient.request.game.setSideboardPlan).not.toHaveBeenCalled();
  });

  it('shows the plan stored in the deck while unlocked', () => {
    renderLobby({ deckList: WITH_PLAN, sideboardLocked: false });
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Mountain')).toBeInTheDocument();
  });

  it('shows the stored plan while locked: Command_DeckSelect locks without clearing it', () => {
    renderLobby({ deckList: WITH_PLAN, sideboardLocked: true });
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Mountain')).toBeInTheDocument();
    expect(within(screen.getByTestId('lobby-deck-main')).queryByText('Mountain')).not.toBeInTheDocument();
  });

  it('an explicit lock on the same deck resets the view to the bare deck, as the server clears the plan', () => {
    const { store } = renderLobby({ deckList: WITH_PLAN, sideboardLocked: false });
    act(() => {
      store.dispatch(setLocalSideboardLock(true));
    });
    expect(within(screen.getByTestId('lobby-deck-main')).getByText('Mountain')).toBeInTheDocument();
    expect(within(screen.getByTestId('lobby-deck-side')).queryByText('Mountain')).not.toBeInTheDocument();
  });

  it('re-selecting a deck after unlocking shows the stored plan again (the lock came from the deck select)', () => {
    const { store } = renderLobby({ deckList: WITH_PLAN, sideboardLocked: false });
    act(() => {
      store.dispatch(setLocalSideboardLock(true));
      store.dispatch(games.Actions.deckSelected({ gameId: 1, deckList: WITH_PLAN }));
    });
    expect(within(screen.getByTestId('lobby-deck-side')).getByText('Mountain')).toBeInTheDocument();
  });
});
