import { ZoneName } from '@cockatrice/sockatrice';
import { useCallback, useMemo } from 'react';

import { CardDTO } from '../../../../services/dexie/DexieDTOs/CardDTO';
import type { GameDialogsActions, HandSortKey } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';
import { revealRecipient } from '../../dialogs/RevealCardsDialog/revealRecipient';

export type HandDialogActions = Pick<
  GameDialogsActions,
  | 'handleHandContextMenu'
  | 'handleRequestChooseMulligan'
  | 'handleRequestRevealHand'
  | 'handleRequestRevealRandom'
  | 'handleRequestViewHand'
  | 'handleRequestSortHandBy'
  | 'handleRequestMoveHandToDeck'
  | 'handleRequestMoveHandToZone'
>;

export interface UseHandDialogActionsArgs {
  env: GameDialogEnv;
  /** Whether the local user may act at all (not a spectator, `canAct` not false). */
  canOpenMenus: boolean;
  set: Pick<GameDialogSetters, 'setHandMenu' | 'setPrompt' | 'setRevealState'>;
  closeAllContextMenus: () => void;
  /** Opens a zone view; "View hand" reuses the zone-view dialog (desktop aViewHand). */
  openZoneView: (playerId: number, zoneName: string) => void;
}

/** The local hand: its menu, mulligan, reveals, sorting and bulk moves. */
export function useHandDialogActions({
  env,
  canOpenMenus,
  set,
  closeAllContextMenus,
  openZoneView,
}: UseHandDialogActionsArgs): HandDialogActions {
  const { gameId, webClient, readGame, readLocalPlayer } = env;
  const { setHandMenu, setPrompt, setRevealState } = set;

  const handleHandContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (gameId == null || !canOpenMenus) {
        return;
      }
      event.preventDefault();
      closeAllContextMenus();
      setHandMenu({ top: event.clientY, left: event.clientX });
    },
    [gameId, canOpenMenus, closeAllContextMenus, setHandMenu],
  );

  const handleRequestChooseMulligan = useCallback(() => {
    if (gameId == null) {
      return;
    }
    // Mulligan accepts [-handSize, handSize + deckSize]; ≤0 is relative-to-hand-size (desktop parity).
    const localPlayer = readLocalPlayer();
    const handSize = localPlayer?.zones[ZoneName.HAND]?.cardCount ?? 0;
    const deckSize = localPlayer?.zones[ZoneName.DECK]?.cardCount ?? 0;
    const min = -handSize;
    const max = handSize + deckSize;
    setPrompt({
      title: 'Take mulligan',
      label: 'New hand size',
      initialValue: '7',
      helperText: '0 and lower are in comparison to current hand size.',
      validate: (v) => {
        if (!/^-?\d+$/.test(v)) {
          return 'Enter an integer.';
        }
        const n = Number(v);
        if (n < min || n > max) {
          return `Enter an integer between ${min} and ${max}.`;
        }
        return null;
      },
      onSubmit: (value) => {
        const input = Number(value);
        const resolved = input < 1 ? handSize + input : input;
        webClient.request.game.mulligan(gameId, { number: resolved });
        setPrompt(null);
      },
    });
  }, [gameId, readLocalPlayer, webClient, setPrompt]);

  const handleRequestRevealHand = useCallback(() => {
    if (gameId == null) {
      return;
    }
    setRevealState({
      title: 'Reveal hand',
      zoneName: ZoneName.HAND,
      zoneLabel: 'Hand',
      showCountInput: false,
      defaultCount: 1,
      onSubmit: ({ targetPlayerId }) => {
        webClient.request.game.revealCards(gameId, {
          zoneName: ZoneName.HAND,
          ...revealRecipient(targetPlayerId),
          topCards: -1,
        });
        setRevealState(null);
      },
    });
  }, [gameId, webClient, setRevealState]);

  // Reuse zone-view dialog for aViewHand parity.
  const handleRequestViewHand = useCallback(() => {
    const game = readGame();
    if (game?.localPlayerId == null) {
      return;
    }
    openZoneView(game.localPlayerId, ZoneName.HAND);
  }, [readGame, openZoneView]);

  // Sort-hand: per-card moveCard dispatches (desktop hand_menu.cpp parity); async for Dexie metadata lookups.
  const handleRequestSortHandBy = useCallback(
    (key: HandSortKey) => {
      const game = readGame();
      const localPlayer = readLocalPlayer();
      if (gameId == null || game == null || localPlayer == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const handZone = localPlayer.zones[ZoneName.HAND];
      if (!handZone) {
        return;
      }
      const cards = handZone.order.map((id) => handZone.byId[id]).filter(Boolean);
      void (async () => {
        const lookups = await Promise.all(
          cards.map(async (card) => {
            const meta = await CardDTO.get(card.name).catch(() => undefined);
            const maintype = meta?.prop?.value?.maintype?.value ?? '';
            const manacost = meta?.prop?.value?.manacost?.value ?? '';
            // CMC approximated from mana-symbol string; needs to be monotonic, not exact.
            const cmc = (() => {
              if (!manacost) {
                return 0;
              }
              const groups = manacost.match(/\{[^}]+\}/g) ?? [];
              let total = 0;
              for (const g of groups) {
                const inner = g.slice(1, -1);
                const n = Number(inner);
                total += Number.isFinite(n) ? n : 1;
              }
              return total;
            })();
            return { card, name: card.name ?? '', maintype, cmc };
          }),
        );
        const sorted = lookups.slice().sort((a, b) => {
          if (key === 'name') {
            return a.name.localeCompare(b.name);
          }
          if (key === 'maintype') {
            const t = a.maintype.localeCompare(b.maintype);
            return t !== 0 ? t : a.name.localeCompare(b.name);
          }
          // manacost
          const c = a.cmc - b.cmc;
          return c !== 0 ? c : a.name.localeCompare(b.name);
        });
        // Reverse dispatch so the first sorted card ends up at index 0.
        for (let i = sorted.length - 1; i >= 0; i--) {
          const entry = sorted[i];
          webClient.request.game.moveCard(gameId, {
            startPlayerId: localPlayerId,
            startZone: ZoneName.HAND,
            cardsToMove: { card: [{ cardId: entry.card.id }] },
            targetPlayerId: localPlayerId,
            targetZone: ZoneName.HAND,
            x: 0,
            y: 0,
            isReversed: false,
          });
        }
      })();
    },
    [readGame, gameId, readLocalPlayer, webClient],
  );

  // Move hand → deck: per-card moveCard, x=0 (top) or x=-1 (bottom).
  const handleRequestMoveHandToDeck = useCallback(
    (top: boolean) => {
      const game = readGame();
      const localPlayer = readLocalPlayer();
      if (gameId == null || localPlayer == null || game?.localPlayerId == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const handZone = localPlayer.zones[ZoneName.HAND];
      if (!handZone) {
        return;
      }
      for (const cardId of handZone.order) {
        webClient.request.game.moveCard(gameId, {
          startPlayerId: localPlayerId,
          startZone: ZoneName.HAND,
          cardsToMove: { card: [{ cardId }] },
          targetPlayerId: localPlayerId,
          targetZone: ZoneName.DECK,
          x: top ? 0 : -1,
          y: 0,
          isReversed: false,
        });
      }
    },
    [readGame, gameId, readLocalPlayer, webClient],
  );

  const handleRequestMoveHandToZone = useCallback(
    (targetZone: string) => {
      const game = readGame();
      const localPlayer = readLocalPlayer();
      if (gameId == null || localPlayer == null || game?.localPlayerId == null) {
        return;
      }
      const localPlayerId = game.localPlayerId;
      const handZone = localPlayer.zones[ZoneName.HAND];
      if (!handZone) {
        return;
      }
      for (const cardId of handZone.order) {
        webClient.request.game.moveCard(gameId, {
          startPlayerId: localPlayerId,
          startZone: ZoneName.HAND,
          cardsToMove: { card: [{ cardId }] },
          targetPlayerId: localPlayerId,
          targetZone,
          x: 0,
          y: 0,
          isReversed: false,
        });
      }
    },
    [readGame, gameId, readLocalPlayer, webClient],
  );

  const handleRequestRevealRandom = useCallback(() => {
    if (gameId == null) {
      return;
    }
    // RANDOM_CARD_FROM_ZONE = -2. See .github/instructions/webatrice-game.instructions.md#dialog-parity.
    const RANDOM_CARD_FROM_ZONE = -2;
    setRevealState({
      title: 'Reveal random card',
      zoneName: ZoneName.HAND,
      zoneLabel: 'Hand (random)',
      showCountInput: false,
      defaultCount: 1,
      onSubmit: ({ targetPlayerId }) => {
        webClient.request.game.revealCards(gameId, {
          zoneName: ZoneName.HAND,
          cardId: [RANDOM_CARD_FROM_ZONE],
          ...revealRecipient(targetPlayerId),
          topCards: -1,
        });
        setRevealState(null);
      },
    });
  }, [gameId, webClient, setRevealState]);

  return useMemo(
    () => ({
      handleHandContextMenu,
      handleRequestChooseMulligan,
      handleRequestRevealHand,
      handleRequestRevealRandom,
      handleRequestViewHand,
      handleRequestSortHandBy,
      handleRequestMoveHandToDeck,
      handleRequestMoveHandToZone,
    }),
    [
      handleHandContextMenu,
      handleRequestChooseMulligan,
      handleRequestRevealHand,
      handleRequestRevealRandom,
      handleRequestViewHand,
      handleRequestSortHandBy,
      handleRequestMoveHandToDeck,
      handleRequestMoveHandToZone,
    ],
  );
}
