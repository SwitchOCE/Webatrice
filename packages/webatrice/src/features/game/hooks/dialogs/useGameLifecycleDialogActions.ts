import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';
import { useCallback, useMemo } from 'react';

import { useAppDispatch } from '@app/store';
import type { SideboardPlanMove } from '../../dialogs/SideboardDialog/SideboardDialog';
import type { GameDialogsActions } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';

export type GameLifecycleDialogActions = Pick<
  GameDialogsActions,
  | 'handlePlayerContextMenu'
  | 'handleRollDieSubmit'
  | 'handleCreateTokenSubmit'
  | 'handleSideboardSubmit'
  | 'handleToggleSideboardLock'
  | 'confirmConcede'
  | 'confirmUnconcede'
  | 'confirmLeave'
>;

export interface UseGameLifecycleDialogActionsArgs {
  env: GameDialogEnv;
  /** Whether the local user may act at all (not a spectator, `canAct` not false). */
  canOpenMenus: boolean;
  set: Pick<
    GameDialogSetters,
    | 'setPlayerMenu'
    | 'setRollDieOpen'
    | 'setLastDieSides'
    | 'setLastDieCount'
    | 'setCreateTokenOpen'
    | 'setSideboardOpen'
    | 'setConcedeConfirm'
    | 'setLeaveConfirm'
  >;
  closeAllContextMenus: () => void;
}

/** Player-level dialogs: the player menu, dice, tokens, sideboard plan, concede and leave. */
export function useGameLifecycleDialogActions({
  env,
  canOpenMenus,
  set,
  closeAllContextMenus,
}: UseGameLifecycleDialogActionsArgs): GameLifecycleDialogActions {
  const { gameId, webClient } = env;
  const {
    setPlayerMenu,
    setRollDieOpen,
    setLastDieSides,
    setLastDieCount,
    setCreateTokenOpen,
    setSideboardOpen,
    setConcedeConfirm,
    setLeaveConfirm,
  } = set;
  const dispatch = useAppDispatch();

  const handlePlayerContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (gameId == null || !canOpenMenus) {
        return;
      }
      event.preventDefault();
      closeAllContextMenus();
      setPlayerMenu({ top: event.clientY, left: event.clientX });
    },
    [gameId, canOpenMenus, closeAllContextMenus, setPlayerMenu],
  );

  const handleRollDieSubmit = useCallback(
    ({ sides, count }: { sides: number; count: number }) => {
      if (gameId == null) {
        return;
      }
      webClient.request.game.rollDie(gameId, { sides, count });
      setLastDieSides(sides);
      setLastDieCount(count);
      setRollDieOpen(false);
    },
    [gameId, webClient, setLastDieSides, setLastDieCount, setRollDieOpen],
  );

  const handleCreateTokenSubmit = useCallback(
    (args: {
      name: string;
      color: string;
      pt: string;
      annotation: string;
      destroyOnZoneChange: boolean;
      faceDown: boolean;
      providerId?: string;
    }) => {
      if (gameId == null) {
        return;
      }
      webClient.request.game.createToken(gameId, {
        zone: ZoneName.TABLE,
        cardName: args.name,
        color: args.color,
        pt: args.pt,
        annotation: args.annotation,
        destroyOnZoneChange: args.destroyOnZoneChange,
        x: 0,
        y: 0,
        faceDown: args.faceDown,
        targetCardId: -1,
        cardProviderId: args.providerId ?? '',
      });
      setCreateTokenOpen(false);
    },
    [gameId, webClient, setCreateTokenOpen],
  );

  const handleSideboardSubmit = useCallback(
    (moveList: SideboardPlanMove[]) => {
      if (gameId == null) {
        return;
      }
      webClient.request.game.setSideboardPlan(gameId, { moveList });
      setSideboardOpen(false);
    },
    [gameId, webClient, setSideboardOpen],
  );

  const handleToggleSideboardLock = useCallback(
    (locked: boolean) => {
      if (gameId == null) {
        return;
      }
      webClient.request.game.setSideboardLock(gameId, { locked });
    },
    [gameId, webClient],
  );

  const confirmConcede = useCallback(() => {
    if (gameId != null) {
      webClient.request.game.concede(gameId);
    }
    setConcedeConfirm(null);
  }, [gameId, webClient, setConcedeConfirm]);

  const confirmUnconcede = useCallback(() => {
    if (gameId != null) {
      webClient.request.game.unconcede(gameId);
    }
    setConcedeConfirm(null);
  }, [gameId, webClient, setConcedeConfirm]);

  // Fire Command_LeaveGame and mirror useLeaveGame's local dispatch —
  // servatrice strips the leaver from Event_Leave before broadcast so
  // the client would never see itself leave without this. Same pattern
  // as `useLeaveGame`; kept here so the confirm flow owns the whole
  // side effect.
  const confirmLeave = useCallback(() => {
    if (gameId != null) {
      webClient.request.game.leaveGame(gameId);
      dispatch(games.Actions.gameLeft({ gameId }));
    }
    setLeaveConfirm(false);
  }, [gameId, webClient, dispatch, setLeaveConfirm]);

  return useMemo(
    () => ({
      handlePlayerContextMenu,
      handleRollDieSubmit,
      handleCreateTokenSubmit,
      handleSideboardSubmit,
      handleToggleSideboardLock,
      confirmConcede,
      confirmUnconcede,
      confirmLeave,
    }),
    [
      handlePlayerContextMenu,
      handleRollDieSubmit,
      handleCreateTokenSubmit,
      handleSideboardSubmit,
      handleToggleSideboardLock,
      confirmConcede,
      confirmUnconcede,
      confirmLeave,
    ],
  );
}
