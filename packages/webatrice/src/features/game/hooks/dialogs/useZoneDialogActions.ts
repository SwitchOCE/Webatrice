import { ZoneName } from '@cockatrice/sockatrice';
import { games, type GameEntry } from '@cockatrice/datatrice';
import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '@app/store';
import type { GameDialogsActions, ZoneViewTarget } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';
import { readShuffleOnClose } from '../../dialogs/shared/zoneViewPreferences';
import { isHiddenZone, offersShuffleOnClose } from '../../dialogs/ZoneViewDialog/zoneViewTarget';

function viewHasZone(game: GameEntry | undefined, view: ZoneViewTarget): boolean {
  return game?.players[view.playerId]?.zones[view.zoneName] != null;
}

export type ZoneDialogActions = Pick<
  GameDialogsActions,
  | 'openZoneView'
  | 'openViewLibrary'
  | 'openViewGraveyard'
  | 'openViewSideboard'
  | 'handleCloseZoneView'
>;

export interface UseZoneDialogActionsArgs {
  env: GameDialogEnv;
  zoneViews: ZoneViewTarget[];
  /** Whether the local user has a seat whose own zones the view shortcuts open. */
  hasSeat: boolean;
  set: Pick<GameDialogSetters, 'setZoneViews'>;
}

/** The zone-view dialog stack. */
export function useZoneDialogActions({
  env,
  zoneViews,
  hasSeat,
  set,
}: UseZoneDialogActionsArgs): ZoneDialogActions {
  const { gameId, webClient, readGame, readLocalPlayer } = env;
  const { setZoneViews } = set;
  const dispatch = useAppDispatch();

  // What closing a view sends: a whole-library view shuffles when "shuffle
  // when closing" is on (desktop ZoneViewWidget::closeEvent); without an
  // explicit answer (Esc, or a view replaced by another) the remembered
  // preference decides. A hidden zone's snapshot is dropped so a later view
  // dumps it fresh (desktop zoneViewCleared).
  const sendViewClosed = useCallback((view: ZoneViewTarget, shuffleOnClose?: boolean) => {
    const { playerId, zoneName } = view;
    if (gameId == null || playerId !== readGame()?.localPlayerId || !isHiddenZone(zoneName)) {
      return;
    }
    if (offersShuffleOnClose(view) && (shuffleOnClose ?? readShuffleOnClose())) {
      webClient.request.game.shuffle(gameId, { zoneName, start: 0, end: -1 });
    }
    dispatch(games.Actions.zoneViewCleared({ gameId, playerId, zoneName }));
  }, [gameId, readGame, webClient, dispatch]);

  // One view per zone. Re-opening the same view is a no-op (no re-dump); a
  // different count of the same hidden zone replaces it, as both read the
  // zone's one revealed snapshot. The replaced view closes first, shuffle
  // included, then the new one dumps afresh. Only the local player's hidden
  // zones are dumped (Command_DumpZone; desktop actViewLibrary,
  // actViewTopCards / actViewBottomCards, actViewSideboard).
  const openZoneView = useCallback((view: ZoneViewTarget) => {
    const game = readGame();
    const sameZone = (v: ZoneViewTarget) => v.playerId === view.playerId && v.zoneName === view.zoneName;
    const open = zoneViews.find(sameZone);
    if (open && open.numberCards === view.numberCards && open.isReversed === view.isReversed) {
      return;
    }
    if (open) {
      sendViewClosed(open);
    }
    setZoneViews((prev) =>
      prev.some(sameZone)
        ? prev.map((v) => (sameZone(v) ? view : v))
        : [...prev, view],
    );
    if (gameId != null && view.playerId === game?.localPlayerId && isHiddenZone(view.zoneName)) {
      webClient.request.game.dumpZone(gameId, {
        playerId: view.playerId,
        zoneName: view.zoneName,
        numberCards: view.numberCards ?? -1,
        isReversed: view.isReversed ?? false,
      });
    }
  }, [zoneViews, gameId, readGame, webClient, setZoneViews, sendViewClosed]);

  // Desktop closes a view when its zone is destroyed (ZoneViewZone::closed →
  // ZoneViewWidget::zoneDeleted), so a player who leaves takes their views
  // along. The selector only answers whether any view has lost its zone, so
  // game updates don't re-render the dialogs. Nothing is sent: the zone is gone.
  const hasOrphanedView = useAppSelector((state) => {
    const game = gameId != null ? games.Selectors.getGame(state, gameId) : undefined;
    return zoneViews.some((v) => !viewHasZone(game, v));
  });
  useEffect(() => {
    if (hasOrphanedView) {
      const game = readGame();
      setZoneViews((prev) => prev.filter((v) => viewHasZone(game, v)));
    }
  }, [hasOrphanedView, readGame, setZoneViews]);

  // The view shortcuts and sidebar buttons open the local seat's own zones.
  const openOwnZoneView = useCallback((zoneName: string) => {
    const playerId = readGame()?.localPlayerId;
    if (hasSeat && playerId != null && readLocalPlayer() != null) {
      openZoneView({ playerId, zoneName });
    }
  }, [hasSeat, readGame, readLocalPlayer, openZoneView]);
  const openViewLibrary = useCallback(() => openOwnZoneView(ZoneName.DECK), [openOwnZoneView]);
  const openViewGraveyard = useCallback(() => openOwnZoneView(ZoneName.GRAVE), [openOwnZoneView]);
  const openViewSideboard = useCallback(() => openOwnZoneView(ZoneName.SIDEBOARD), [openOwnZoneView]);

  const handleCloseZoneView = useCallback((playerId: number, zoneName: string, shuffleOnClose?: boolean) => {
    const view = zoneViews.find((v) => v.playerId === playerId && v.zoneName === zoneName);
    if (!view) {
      return;
    }
    setZoneViews((prev) =>
      prev.filter((v) => !(v.playerId === playerId && v.zoneName === zoneName)),
    );
    sendViewClosed(view, shuffleOnClose);
  }, [zoneViews, setZoneViews, sendViewClosed]);

  return useMemo(
    () => ({
      openZoneView,
      openViewLibrary,
      openViewGraveyard,
      openViewSideboard,
      handleCloseZoneView,
    }),
    [
      openZoneView,
      openViewLibrary,
      openViewGraveyard,
      openViewSideboard,
      handleCloseZoneView,
    ],
  );
}
