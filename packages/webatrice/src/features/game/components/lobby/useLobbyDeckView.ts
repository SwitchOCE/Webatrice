import { useCallback, useMemo, useRef, useState } from 'react';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';

import {
  applySideboardPlan,
  getSideboardPlan,
  otherDeckZone,
  parseDeckView,
  type DeckView,
  type DeckZone,
  type SideboardPlanMove,
} from './deckViewModel';

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

interface PlanOverride {
  deckList: string;
  plan: SideboardPlanMove[];
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
 * only an explicit lock clears it (`cmdSetSideboardLock`), so only a lock
 * transition on the same deck resets the view to the bare deck
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

  const [override, setOverride] = useState<PlanOverride | null>(null);
  const [unloaded, setUnloaded] = useState(false);

  // A deck-select response re-enters the deck-loaded view even when the
  // server returned the same string (desktop's deckSelectFinished). It also
  // drops any plan reset: the server broadcasts the deck select's own lock
  // event before this response, and that lock keeps the deck's stored plan.
  useReduxEffect<{ gameId: number }>(({ payload }) => {
    if (payload.gameId === gameId) {
      setUnloaded(false);
      setOverride(null);
    }
  }, games.Types.DECK_SELECTED, [gameId]);

  // An explicit lock clears the server's plan. Handled as the event arrives,
  // not on a re-render, so a deck select's lock event followed by its
  // response in the same batch still ends on the stored plan.
  const lockState = useRef({ sideboardLocked, deckList });
  lockState.current = { sideboardLocked, deckList };
  useReduxEffect<{ gameId: number; playerId: number; properties: { sideboardLocked?: boolean } }>(({ payload }) => {
    const current = lockState.current;
    if (
      payload.gameId === gameId
      && payload.playerId === localPlayerId
      && payload.properties.sideboardLocked
      && !current.sideboardLocked
    ) {
      setOverride({ deckList: current.deckList, plan: [] });
    }
  }, games.Types.PLAYER_PROPERTIES_CHANGED, [gameId, localPlayerId]);

  const plan = useMemo(() => {
    if (!parsed) {
      return [];
    }
    return override?.deckList === deckList ? override.plan : parsed.currentPlan;
  }, [parsed, override, deckList]);

  const view = useMemo(() => (parsed ? applySideboardPlan(parsed.view, plan) : null), [parsed, plan]);
  const editable = !!view && !ready && !sideboardLocked;

  const moveCard = useCallback(
    (zone: DeckZone, cardName: string) => {
      if (!view || !editable) {
        return;
      }
      const moved = applySideboardPlan(view, [{ cardName, startZone: zone, targetZone: otherDeckZone(zone) }]);
      const moveList = getSideboardPlan(moved);
      setOverride({ deckList, plan: moveList });
      webClient.request.game.setSideboardPlan(gameId, { moveList });
    },
    [view, editable, deckList, gameId, webClient],
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
    setUnloaded(true);
    if (ready) {
      webClient.request.game.readyStart(gameId, { ready: false });
    }
  }, [ready, gameId, webClient]);

  return {
    deckLoaded: !!view && !unloaded,
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
