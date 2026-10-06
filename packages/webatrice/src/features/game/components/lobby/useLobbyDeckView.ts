import { useCallback, useMemo } from 'react';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useAppSelector } from '@app/store';

import {
  applySideboardPlan,
  getSideboardPlan,
  otherDeckZone,
  parseDeckView,
  type DeckView,
  type DeckZone,
} from './deckViewModel';
import { useLobbyDeckState } from './LobbyDeckStateProvider';

export interface LobbyDeckView {
  /** Desktop's "deck loaded" state: the server returned a deck and it wasn't unloaded. */
  deckLoaded: boolean;
  /** The deck with the current plan applied (null while no deck is loaded). */
  view: DeckView | null;
  ready: boolean;
  sideboardLocked: boolean;
  /** `DeckView::setLocked(ready || sideboardLocked)` inverted. */
  editable: boolean;
  /** Moves one copy of `cardName` out of `zone` and sends the new plan. */
  moveCard: (zone: DeckZone, cardName: string) => void;
  /** Sends Command_SetSideboardLock with the opposite of the server's state. */
  toggleSideboardLock: () => void;
  /** Toggles Command_ReadyStart. */
  toggleReady: () => void;
  /** Back to the deck picker; un-readies first, as desktop's unloadDeck does. */
  unloadDeck: () => void;
}

/**
 * State and commands behind the pre-game deck view — desktop's
 * `DeckViewContainer` deck-loaded state (`deck_view_container.cpp`).
 *
 * The plan shown is the one the server will deal with
 * (`Server_Player::setupZones` applies `getCurrentSideboardPlan()` whatever
 * the lock state): the user's edits since the deck arrived, else the plan
 * stored in the deck string (`DeckViewScene::setDeck`). Selecting a deck locks
 * the sideboard but keeps its stored plan (`Server_Player::cmdDeckSelect`);
 * an explicit lock clears it (`cmdSetSideboardLock`), so a lock
 * echo resets the view to the bare deck
 * (`DeckViewContainer::setSideboardLocked` → `resetSideboardPlan`).
 */
export function useLobbyDeckView(gameId: number): LobbyDeckView {
  const webClient = useWebClient();
  const localPlayer = useAppSelector((state) => games.Selectors.getLocalPlayer(state, gameId));
  const localPlayerId = localPlayer?.properties.playerId;
  const deckList = localPlayer?.deckList ?? '';
  const ready = localPlayer?.properties.readyStart ?? false;
  const sideboardLocked = localPlayer?.properties.sideboardLocked ?? true;

  const parsed = useMemo(() => parseDeckView(deckList), [deckList]);

  const { state, setState } = useLobbyDeckState(gameId, localPlayerId, deckList);

  const plan = useMemo(() => {
    if (!parsed) {
      return [];
    }
    return state?.plan ?? parsed.currentPlan;
  }, [parsed, state]);

  const view = useMemo(() => (parsed ? applySideboardPlan(parsed.view, plan) : null), [parsed, plan]);
  const editable = !!view && !ready && !sideboardLocked;

  const moveCard = useCallback(
    (zone: DeckZone, cardName: string) => {
      if (!view || !editable) {
        return;
      }
      const moved = applySideboardPlan(view, [{ cardName, startZone: zone, targetZone: otherDeckZone(zone) }]);
      const moveList = getSideboardPlan(moved);
      setState({ plan: moveList });
      webClient.request.game.setSideboardPlan(gameId, { moveList });
    },
    [view, editable, setState, gameId, webClient],
  );

  const toggleSideboardLock = useCallback(() => {
    if (ready) {
      return;
    }
    webClient.request.game.setSideboardLock(gameId, { locked: !sideboardLocked });
  }, [ready, sideboardLocked, gameId, webClient]);

  const toggleReady = useCallback(() => {
    webClient.request.game.readyStart(gameId, { ready: !ready });
  }, [ready, gameId, webClient]);

  const unloadDeck = useCallback(() => {
    setState({ unloaded: true });
    webClient.request.game.readyStart(gameId, { ready: false });
  }, [setState, gameId, webClient]);

  return {
    deckLoaded: !!view && !state?.unloaded,
    view,
    ready,
    sideboardLocked,
    editable,
    moveCard,
    toggleSideboardLock,
    toggleReady,
    unloadDeck,
  };
}
