import { useCallback, useMemo } from 'react';
import { useStore } from 'react-redux';

import { useSettings } from '@app/hooks';
import type { RootState } from '@app/store';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { games } from '@cockatrice/datatrice';
import type { GameAccess } from './useGameAccess';
import { useJudgeTarget } from './useJudgeTarget';
import type { SelectedCard } from '../utils/selection';
import type { GameDialogs, GameDialogsActions, StartPendingSource } from './dialogs/gameDialogs.types';
import type { GameDialogEnv } from './dialogs/gameDialogEnv';
import { useGameDialogState } from './dialogs/useGameDialogState';
import { useCardDialogActions } from './dialogs/useCardDialogActions';
import { useZoneDialogActions } from './dialogs/useZoneDialogActions';
import { useLibraryDialogActions } from './dialogs/useLibraryDialogActions';
import { useHandDialogActions } from './dialogs/useHandDialogActions';
import { useGameLifecycleDialogActions } from './dialogs/useGameLifecycleDialogActions';

export * from './dialogs/gameDialogs.types';

export interface UseGameDialogsArgs {
  gameId: number | undefined;
  localAccess: GameAccess;
  isSpectator: boolean;
  startPendingArrow: (source: StartPendingSource) => void;
  startPendingAttach: (source: StartPendingSource) => void;
  // Applies the collapse-unless-selected rule before opening the card menu, so a
  // right-click on an unselected card collapses to it while a right-click on a
  // selected card preserves the multi-selection for bulk actions.
  collapseUnlessSelected: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
  // Call-time getter for the live multi-selection. A bulk card action (set P/T,
  // annotation, counter) applies to the whole selection when the menu's card is
  // part of it, else just that card. Read at submit, not closed over, to keep the
  // memoized action surface stable. See effectiveTargets / readGame precedent.
  getSelectedCards: () => readonly SelectedCard[];
}

/**
 * The game's dialog and context-menu owner: one instance per game, published
 * through GameDialogsContext. A façade over `./dialogs`: `useGameDialogState`
 * owns the open/closed state, and one action hook per domain (card, zone,
 * library, hand, game lifecycle) owns the handlers that open, fill and submit
 * those dialogs.
 */
export function useGameDialogs({
  gameId,
  localAccess,
  isSpectator,
  startPendingArrow,
  startPendingAttach,
  collapseUnlessSelected,
  getSelectedCards,
}: UseGameDialogsArgs): GameDialogs {
  const webClient = useWebClient();
  const store = useStore<RootState>();
  const judgeTarget = useJudgeTarget(gameId);
  const { value: settings } = useSettings();
  const invertVerticalCoordinate = settings?.invertVerticalCoordinate ?? false;

  // Read the latest game / local player from the store at CALL time, never at
  // render time. The action handlers used to close over the `game`/`localPlayer`
  // props, which made every handler — and therefore the memoized return — churn
  // on every game-state update, defeating the dialog/menu `memo()` wrappers during
  // play. These getters depend only on the (stable) store and gameId, so the
  // handlers can drop `game`/`localPlayer` from their dep arrays. Store-read
  // precedent: useReduxEffect.
  const readGame = useCallback(
    () => (gameId != null ? games.Selectors.getGame(store.getState(), gameId) : undefined),
    [store, gameId],
  );
  const readLocalPlayer = useCallback(
    () => (gameId != null ? games.Selectors.getLocalPlayer(store.getState(), gameId) : undefined),
    [store, gameId],
  );
  const env = useMemo<GameDialogEnv>(
    () => ({ gameId, webClient, readGame, readLocalPlayer, judgeTarget }),
    [gameId, webClient, readGame, readLocalPlayer, judgeTarget],
  );
  const canOpenMenus = !isSpectator && localAccess.canAct !== false;

  const { state, set, toggles, closeAllContextMenus, createTokenRequest } = useGameDialogState();

  const card = useCardDialogActions({
    env,
    cardMenu: state.cardMenu,
    set,
    closeAllContextMenus,
    invertVerticalCoordinate,
    startPendingArrow,
    startPendingAttach,
    collapseUnlessSelected,
    getSelectedCards,
  });
  const zone = useZoneDialogActions({
    env,
    zoneViews: state.zoneViews,
    zoneMenu: state.zoneMenu,
    set,
    closeAllContextMenus,
  });
  const library = useLibraryDialogActions({ env, set });
  const hand = useHandDialogActions({
    env,
    canOpenMenus,
    set,
    closeAllContextMenus,
    openZoneView: zone.handleZoneClick,
  });
  const lifecycle = useGameLifecycleDialogActions({ env, canOpenMenus, set, closeAllContextMenus, createTokenRequest });

  // The action surface is decoupled from game state (handlers read the latest
  // game/local-player from the store at call time), so it only changes when a
  // handler's own inputs (an open menu, the zone-view stack) change. The merged
  // value below then changes only with dialog STATE, letting the propless,
  // memo()'d dialogs/menus skip the per-frame Game re-renders during play.
  const actions = useMemo<GameDialogsActions>(
    () => ({ ...toggles, ...card, ...zone, ...library, ...hand, ...lifecycle }),
    [toggles, card, zone, library, hand, lifecycle],
  );

  return useMemo<GameDialogs>(() => ({ ...state, ...actions }), [state, actions]);
}
