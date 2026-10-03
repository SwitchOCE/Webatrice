import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';
import { useCallback, useMemo } from 'react';

import { useAppDispatch } from '@app/store';
import type { GameDialogsActions, ZoneMenuState, ZoneViewTarget } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';

export type ZoneDialogActions = Pick<
  GameDialogsActions,
  | 'handleZoneClick'
  | 'handleCloseZoneView'
  | 'handleZoneContextMenu'
  | 'handleRequestViewZone'
  | 'handleRequestRevealZone'
  | 'handleRequestMoveAllFromZoneToDeck'
  | 'handleRequestMoveAllFromZoneTo'
  | 'handleRequestRevealRandomFromZone'
>;

export interface UseZoneDialogActionsArgs {
  env: GameDialogEnv;
  zoneViews: ZoneViewTarget[];
  zoneMenu: ZoneMenuState | null;
  set: Pick<GameDialogSetters, 'setZoneViews' | 'setZoneMenu' | 'setRevealState'>;
  closeAllContextMenus: () => void;
}

/** The zone-view dialog stack and the graveyard / exile / library zone menu. */
export function useZoneDialogActions({
  env,
  zoneViews,
  zoneMenu,
  set,
  closeAllContextMenus,
}: UseZoneDialogActionsArgs): ZoneDialogActions {
  const { gameId, webClient, readGame } = env;
  const { setZoneViews, setZoneMenu, setRevealState } = set;
  const dispatch = useAppDispatch();

  const handleZoneClick = useCallback((playerId: number, zoneName: string) => {
    const game = readGame();
    const alreadyOpen = zoneViews.some((v) => v.playerId === playerId && v.zoneName === zoneName);
    setZoneViews((prev) =>
      alreadyOpen ? prev : [...prev, { playerId, zoneName }],
    );
    // Reveal the deck's hidden cards: dump the local player's library and let the
    // Response_DumpZone card list flow into the store (read back via getRevealedCards).
    // Re-opening an already-open view is a no-op (don't re-dump), matching desktop.
    if (
      !alreadyOpen &&
      gameId != null &&
      playerId === game?.localPlayerId &&
      zoneName === ZoneName.DECK
    ) {
      webClient.request.game.dumpZone(gameId, { playerId, zoneName, numberCards: -1, isReversed: false });
    }
  }, [zoneViews, gameId, readGame, webClient, setZoneViews]);

  const handleCloseZoneView = useCallback((playerId: number, zoneName: string, shuffleOnClose?: boolean) => {
    const game = readGame();
    setZoneViews((prev) =>
      prev.filter((v) => !(v.playerId === playerId && v.zoneName === zoneName)),
    );
    // Closing a deck view shuffles the library (desktop "shuffle on close") and discards the
    // revealed snapshot so a later view re-dumps fresh.
    if (gameId != null && playerId === game?.localPlayerId && zoneName === ZoneName.DECK) {
      if (shuffleOnClose) {
        webClient.request.game.shuffle(gameId, { zoneName, start: 0, end: -1 });
      }
      dispatch(games.Actions.zoneViewCleared({ gameId, playerId, zoneName }));
    }
  }, [gameId, readGame, webClient, dispatch, setZoneViews]);

  const handleZoneContextMenu = useCallback(
    (playerId: number, zoneName: string, event: React.MouseEvent) => {
      if (playerId !== readGame()?.localPlayerId) {
        return;
      }
      const supported =
        zoneName === ZoneName.DECK ||
        zoneName === ZoneName.GRAVE ||
        zoneName === ZoneName.EXILE;
      if (!supported) {
        return;
      }
      event.preventDefault();
      closeAllContextMenus();
      setZoneMenu({
        playerId,
        zoneName,
        anchorPosition: { top: event.clientY, left: event.clientX },
      });
    },
    [readGame, closeAllContextMenus, setZoneMenu],
  );

  // Client-only zone-view (no server roundtrip).
  const handleRequestViewZone = useCallback(() => {
    if (zoneMenu == null) {
      return;
    }
    handleZoneClick(zoneMenu.playerId, zoneMenu.zoneName);
  }, [handleZoneClick, zoneMenu]);

  const handleRequestRevealZone = useCallback(() => {
    if (gameId == null || zoneMenu == null) {
      return;
    }
    const { zoneName } = zoneMenu;
    const label =
      zoneName === ZoneName.GRAVE ? 'Graveyard' :
        zoneName === ZoneName.EXILE ? 'Exile' : zoneName;
    setRevealState({
      title: `Reveal ${label.toLowerCase()}`,
      zoneName,
      zoneLabel: label,
      showCountInput: false,
      defaultCount: 1,
      onSubmit: ({ targetPlayerId }) => {
        webClient.request.game.revealCards(gameId, {
          zoneName,
          playerId: targetPlayerId,
          topCards: -1,
        });
        setRevealState(null);
      },
    });
  }, [gameId, zoneMenu, webClient, setRevealState]);

  // Move every card in source zone → target via one moveCard each.
  const handleRequestMoveAllFromZoneToDeck = useCallback(
    (top: boolean) => {
      const game = readGame();
      if (gameId == null || zoneMenu == null || game == null) {
        return;
      }
      const sourcePlayerId = zoneMenu.playerId;
      const sourceZoneName = zoneMenu.zoneName;
      const sourceZone = game.players[sourcePlayerId]?.zones[sourceZoneName];
      if (!sourceZone) {
        return;
      }
      for (const cardId of sourceZone.order) {
        webClient.request.game.moveCard(gameId, {
          startPlayerId: sourcePlayerId,
          startZone: sourceZoneName,
          cardsToMove: { card: [{ cardId }] },
          targetPlayerId: sourcePlayerId,
          targetZone: ZoneName.DECK,
          x: top ? 0 : -1,
          y: 0,
          isReversed: false,
        });
      }
    },
    [readGame, gameId, webClient, zoneMenu],
  );

  const handleRequestMoveAllFromZoneTo = useCallback(
    (targetZone: string) => {
      const game = readGame();
      if (gameId == null || zoneMenu == null || game == null) {
        return;
      }
      const sourcePlayerId = zoneMenu.playerId;
      const sourceZoneName = zoneMenu.zoneName;
      const sourceZone = game.players[sourcePlayerId]?.zones[sourceZoneName];
      if (!sourceZone) {
        return;
      }
      for (const cardId of sourceZone.order) {
        webClient.request.game.moveCard(gameId, {
          startPlayerId: sourcePlayerId,
          startZone: sourceZoneName,
          cardsToMove: { card: [{ cardId }] },
          targetPlayerId: sourcePlayerId,
          targetZone,
          x: 0,
          y: 0,
          isReversed: false,
        });
      }
    },
    [readGame, gameId, webClient, zoneMenu],
  );

  const handleRequestRevealRandomFromZone = useCallback(() => {
    if (gameId == null || zoneMenu == null) {
      return;
    }
    const sourceZoneName = zoneMenu.zoneName;
    const label =
      sourceZoneName === ZoneName.GRAVE ? 'Graveyard'
        : sourceZoneName === ZoneName.EXILE ? 'Exile'
          : sourceZoneName;
    // See .github/instructions/webatrice-game.instructions.md#dialog-parity.
    const RANDOM_CARD_FROM_ZONE = -2;
    setRevealState({
      title: `Reveal random card from ${label.toLowerCase()}`,
      zoneName: sourceZoneName,
      zoneLabel: `${label} (random)`,
      showCountInput: false,
      defaultCount: 1,
      onSubmit: ({ targetPlayerId }) => {
        webClient.request.game.revealCards(gameId, {
          zoneName: sourceZoneName,
          cardId: [RANDOM_CARD_FROM_ZONE],
          playerId: targetPlayerId,
          topCards: -1,
        });
        setRevealState(null);
      },
    });
  }, [gameId, webClient, zoneMenu, setRevealState]);

  return useMemo(
    () => ({
      handleZoneClick,
      handleCloseZoneView,
      handleZoneContextMenu,
      handleRequestViewZone,
      handleRequestRevealZone,
      handleRequestMoveAllFromZoneToDeck,
      handleRequestMoveAllFromZoneTo,
      handleRequestRevealRandomFromZone,
    }),
    [
      handleZoneClick,
      handleCloseZoneView,
      handleZoneContextMenu,
      handleRequestViewZone,
      handleRequestRevealZone,
      handleRequestMoveAllFromZoneToDeck,
      handleRequestMoveAllFromZoneTo,
      handleRequestRevealRandomFromZone,
    ],
  );
}
