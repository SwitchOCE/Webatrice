import { ZoneName } from '@cockatrice/sockatrice';
import { useCallback, useMemo } from 'react';

import type { GameDialogsActions } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';

export type LibraryDialogActions = Pick<
  GameDialogsActions,
  | 'handleRequestDrawN'
  | 'handleRequestDumpN'
  | 'handleRequestRevealTopN'
  | 'handleRequestUndoDraw'
  | 'handleRequestDrawBottom'
  | 'handleRequestMoveTopCardToZone'
  | 'handleRequestPlayTop'
  | 'handleRequestMoveTopNToZone'
  | 'handleRequestShuffleTopN'
  | 'handleRequestShuffleBottomN'
>;

export interface UseLibraryDialogActionsArgs {
  env: GameDialogEnv;
  set: Pick<GameDialogSetters, 'setPrompt' | 'setRevealState'>;
}

// Hidden-zone command addressing is positional. See .github/instructions/webatrice-game.instructions.md#servatrice-game-event-quirks.

/** The local library: draw, dump, reveal, shuffle and top/bottom moves. */
export function useLibraryDialogActions({ env, set }: UseLibraryDialogActionsArgs): LibraryDialogActions {
  const { gameId, webClient, readGame } = env;
  const { setPrompt, setRevealState } = set;

  const handleRequestDrawN = useCallback(() => {
    if (gameId == null) {
      return;
    }
    setPrompt({
      title: 'Draw N cards',
      label: 'Number of cards',
      initialValue: '1',
      validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
      onSubmit: (value) => {
        webClient.request.game.drawCards(gameId, { number: Number(value) });
        setPrompt(null);
      },
    });
  }, [gameId, webClient, setPrompt]);

  const handleRequestDumpN = useCallback(() => {
    const game = readGame();
    if (gameId == null || game == null) {
      return;
    }
    setPrompt({
      title: 'Dump top N',
      label: 'Number of cards',
      initialValue: '1',
      validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
      onSubmit: (value) => {
        webClient.request.game.dumpZone(gameId, {
          playerId: game.localPlayerId,
          zoneName: ZoneName.DECK,
          numberCards: Number(value),
          isReversed: false,
        });
        setPrompt(null);
      },
    });
  }, [readGame, gameId, webClient, setPrompt]);

  const handleRequestRevealTopN = useCallback(() => {
    if (gameId == null) {
      return;
    }
    setRevealState({
      title: 'Reveal top N cards',
      zoneName: ZoneName.DECK,
      zoneLabel: 'Library',
      showCountInput: true,
      defaultCount: 1,
      onSubmit: ({ targetPlayerId, topCards }) => {
        webClient.request.game.revealCards(gameId, {
          zoneName: ZoneName.DECK,
          playerId: targetPlayerId,
          topCards,
        });
        setRevealState(null);
      },
    });
  }, [gameId, webClient, setRevealState]);

  const handleRequestUndoDraw = useCallback(() => {
    if (gameId == null) {
      return;
    }
    webClient.request.game.undoDraw(gameId);
  }, [gameId, webClient]);

  const handleRequestDrawBottom = useCallback(() => {
    const game = readGame();
    if (gameId == null || game?.localPlayerId == null) {
      return;
    }
    const localPlayerId = game.localPlayerId;
    const deck = game.players[localPlayerId]?.zones[ZoneName.DECK];
    const cardCount = deck?.cardCount ?? 0;
    if (cardCount === 0) {
      return;
    }
    // Draw bottom: card_id = size-1.
    webClient.request.game.moveCard(gameId, {
      startPlayerId: localPlayerId,
      startZone: ZoneName.DECK,
      cardsToMove: { card: [{ cardId: cardCount - 1 }] },
      targetPlayerId: localPlayerId,
      targetZone: ZoneName.HAND,
      x: 0,
      y: 0,
      isReversed: false,
    });
  }, [readGame, gameId, webClient]);

  const handleRequestMoveTopCardToZone = useCallback(
    (targetZone: string, options?: { x?: number }) => {
      const game = readGame();
      if (gameId == null || game?.localPlayerId == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const deck = game.players[localPlayerId]?.zones[ZoneName.DECK];
      if ((deck?.cardCount ?? 0) === 0) {
        return;
      }
      // card_id = 0 for top.
      webClient.request.game.moveCard(gameId, {
        startPlayerId: localPlayerId,
        startZone: ZoneName.DECK,
        cardsToMove: { card: [{ cardId: 0 }] },
        targetPlayerId: localPlayerId,
        targetZone,
        x: options?.x ?? 0,
        y: 0,
        isReversed: false,
      });
    },
    [readGame, gameId, webClient],
  );

  const handleRequestPlayTop = useCallback(
    (faceDown: boolean) => {
      const game = readGame();
      if (gameId == null || game?.localPlayerId == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const deck = game.players[localPlayerId]?.zones[ZoneName.DECK];
      if ((deck?.cardCount ?? 0) === 0) {
        return;
      }
      // Play-from-top deliberately ignores tablerow. See .github/instructions/webatrice-game.instructions.md#servatrice-game-event-quirks.
      webClient.request.game.moveCard(gameId, {
        startPlayerId: localPlayerId,
        startZone: ZoneName.DECK,
        cardsToMove: { card: [{ cardId: 0, faceDown }] },
        targetPlayerId: localPlayerId,
        targetZone: faceDown ? ZoneName.TABLE : ZoneName.STACK,
        x: -1,
        y: 0,
        isReversed: false,
      });
    },
    [readGame, gameId, webClient],
  );

  const handleRequestMoveTopNToZone = useCallback(
    (targetZone: string) => {
      const game = readGame();
      if (gameId == null || game?.localPlayerId == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const zoneLabel =
        targetZone === ZoneName.GRAVE ? 'graveyard'
          : targetZone === ZoneName.EXILE ? 'exile' : targetZone;
      setPrompt({
        title: `Move top N cards to ${zoneLabel}`,
        label: 'Number of cards',
        initialValue: '1',
        validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
        onSubmit: (value) => {
          const requested = Number(value);
          const deck = game.players[localPlayerId]?.zones[ZoneName.DECK];
          const cardCount = deck?.cardCount ?? 0;
          if (cardCount === 0) {
            setPrompt(null);
            return;
          }
          const n = Math.min(requested, cardCount);
          // Positional indices [n-1, ..., 0]; server resolves against deck ordering.
          const cards: { cardId: number }[] = [];
          for (let i = n - 1; i >= 0; i--) {
            cards.push({ cardId: i });
          }
          webClient.request.game.moveCard(gameId, {
            startPlayerId: localPlayerId,
            startZone: ZoneName.DECK,
            cardsToMove: { card: cards },
            targetPlayerId: localPlayerId,
            targetZone,
            x: 0,
            y: 0,
            isReversed: false,
          });
          setPrompt(null);
        },
      });
    },
    [readGame, gameId, webClient, setPrompt],
  );

  const handleRequestShuffleTopN = useCallback(() => {
    if (gameId == null) {
      return;
    }
    setPrompt({
      title: 'Shuffle top N cards',
      label: 'Number of cards',
      initialValue: '1',
      validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
      onSubmit: (value) => {
        const n = Number(value);
        webClient.request.game.shuffle(gameId, {
          zoneName: ZoneName.DECK,
          start: 0,
          end: n - 1,
        });
        setPrompt(null);
      },
    });
  }, [gameId, webClient, setPrompt]);

  const handleRequestShuffleBottomN = useCallback(() => {
    if (gameId == null) {
      return;
    }
    setPrompt({
      title: 'Shuffle bottom N cards',
      label: 'Number of cards',
      initialValue: '1',
      validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
      onSubmit: (value) => {
        const n = Number(value);
        // Cockatrice player_actions.cpp:272 — negative `start` indexes from
        // the end of the zone; end=-1 means the last card.
        webClient.request.game.shuffle(gameId, {
          zoneName: ZoneName.DECK,
          start: -n,
          end: -1,
        });
        setPrompt(null);
      },
    });
  }, [gameId, webClient, setPrompt]);

  return useMemo(
    () => ({
      handleRequestDrawN,
      handleRequestDumpN,
      handleRequestRevealTopN,
      handleRequestUndoDraw,
      handleRequestDrawBottom,
      handleRequestMoveTopCardToZone,
      handleRequestPlayTop,
      handleRequestMoveTopNToZone,
      handleRequestShuffleTopN,
      handleRequestShuffleBottomN,
    }),
    [
      handleRequestDrawN,
      handleRequestDumpN,
      handleRequestRevealTopN,
      handleRequestUndoDraw,
      handleRequestDrawBottom,
      handleRequestMoveTopCardToZone,
      handleRequestPlayTop,
      handleRequestMoveTopNToZone,
      handleRequestShuffleTopN,
      handleRequestShuffleBottomN,
    ],
  );
}
