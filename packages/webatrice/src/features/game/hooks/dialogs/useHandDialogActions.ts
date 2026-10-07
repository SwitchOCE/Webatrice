import { ZoneName } from '@cockatrice/sockatrice';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CardDTO } from '../../../../services/dexie/DexieDTOs/CardDTO';
import type { GameDialogsActions, HandSortKey } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';

export type HandDialogActions = Pick<
  GameDialogsActions,
  | 'handleRequestChooseMulligan'
  | 'handleRequestSortHandBy'
>;

export interface UseHandDialogActionsArgs {
  env: GameDialogEnv;
  set: Pick<GameDialogSetters, 'setPrompt'>;
}

/** The local hand's mulligan prompt and sorting, behind the hand menu and the game shortcuts. */
export function useHandDialogActions({
  env,
  set,
}: UseHandDialogActionsArgs): HandDialogActions {
  const { t } = useTranslation();
  const { gameId, webClient, readGame, readLocalPlayer } = env;
  const { setPrompt } = set;

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
      title: t('GamePrompt.mulligan.title'),
      label: t('GamePrompt.library.numberOfCards'),
      initialValue: '7',
      helperText: t('GamePrompt.mulligan.helper'),
      validate: (v) => {
        if (!/^-?\d+$/.test(v)) {
          return t('GamePrompt.validation.integer');
        }
        const n = Number(v);
        if (n < min || n > max) {
          return t('GamePrompt.validation.integerRange', { min, max });
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
  }, [gameId, readLocalPlayer, webClient, setPrompt, t]);

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
      // A singleton hand is already sorted; desktop only reorganizes it locally.
      // Do not send a redundant move for a sort that cannot change its order.
      if (cards.length < 2) {
        return;
      }
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

  return useMemo(
    () => ({
      handleRequestChooseMulligan,
      handleRequestSortHandBy,
    }),
    [
      handleRequestChooseMulligan,
      handleRequestSortHandBy,
    ],
  );
}
