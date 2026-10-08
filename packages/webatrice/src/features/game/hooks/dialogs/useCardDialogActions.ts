import { ZoneName, moveTargetPlayerId } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { useCallback, useMemo } from 'react';

import { COUNTER_TYPE_LABELS } from '../../components/ui/SeatCard/counterColors';
import { effectiveTargets, type SelectedCard } from '../../utils/selection';
import { playCardViaTableRow } from '../playCard';
import type { CardMenuState, GameDialogsActions, SeatCardMenuState, StartPendingSource } from './gameDialogs.types';
import type { GameDialogEnv } from './gameDialogEnv';
import type { GameDialogSetters } from './useGameDialogState';

export type CardDialogActions = Pick<
  GameDialogsActions,
  | 'handleCardContextMenu'
  | 'openSeatCardMenu'
  | 'handleRequestSetPT'
  | 'handleRequestSetAnnotation'
  | 'handleRequestSetCardCounter'
  | 'handleRequestDrawArrow'
  | 'handleRequestAttach'
  | 'handleRequestPlayFromCardMenu'
  | 'handleRequestMoveToLibraryAt'
>;

export interface UseCardDialogActionsArgs {
  env: GameDialogEnv;
  cardMenu: CardMenuState | null;
  set: Pick<GameDialogSetters, 'setCardMenu' | 'setSeatCardMenu' | 'setPrompt'>;
  closeAllContextMenus: () => void;
  invertVerticalCoordinate: boolean;
  startPendingArrow: (source: StartPendingSource) => void;
  startPendingAttach: (source: StartPendingSource) => void;
  collapseUnlessSelected: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
  getSelectedCards: () => readonly SelectedCard[];
}

/** The card context menu: opening it, and the prompts and modes its items start. */
export function useCardDialogActions({
  env,
  cardMenu,
  set,
  closeAllContextMenus,
  invertVerticalCoordinate,
  startPendingArrow,
  startPendingAttach,
  collapseUnlessSelected,
  getSelectedCards,
}: UseCardDialogActionsArgs): CardDialogActions {
  const { gameId, webClient, readGame, judgeTarget } = env;
  const { setCardMenu, setSeatCardMenu, setPrompt } = set;

  const handleCardContextMenu = useCallback(
    (
      sourcePlayerId: number | undefined,
      sourceZone: string | undefined,
      card: ServerInfo_Card,
      event: React.MouseEvent,
    ) => {
      if (sourcePlayerId == null || sourceZone == null) {
        return;
      }
      event.preventDefault();
      // Collapse to this card unless it's already part of the selection.
      collapseUnlessSelected(sourcePlayerId, sourceZone, card);
      closeAllContextMenus();
      setCardMenu({
        card,
        sourcePlayerId,
        sourceZone,
        anchorPosition: { top: event.clientY, left: event.clientX },
      });
    },
    [closeAllContextMenus, collapseUnlessSelected, setCardMenu],
  );

  const openSeatCardMenu = useCallback((menu: SeatCardMenuState) => {
    closeAllContextMenus();
    setSeatCardMenu(menu);
  }, [closeAllContextMenus, setSeatCardMenu]);

  // The cards a card-menu bulk action targets: the whole selection when the
  // menu's card is part of a ≥2 selection, else just that card (n=1 = today's
  // single-card behavior). Read at call time so these handlers don't dep on the
  // churning selection. See effectiveTargets.
  const menuTargets = useCallback(
    (menu: CardMenuState): readonly SelectedCard[] =>
      effectiveTargets(getSelectedCards(), {
        ownerPlayerId: menu.sourcePlayerId,
        zone: menu.sourceZone,
        card: menu.card,
      }),
    [getSelectedCards],
  );

  const handleRequestSetPT = useCallback(() => {
    const menu = cardMenu;
    if (!menu || gameId == null) {
      return;
    }
    setPrompt({
      title: 'Set power/toughness',
      label: 'P/T (e.g. 3/3)',
      initialValue: menu.card.pt ?? '',
      onSubmit: (value) => {
        webClient.request.game.bulkSetPT(gameId, menuTargets(menu), value, judgeTarget);
        setPrompt(null);
      },
    });
  }, [cardMenu, judgeTarget, gameId, webClient, menuTargets, setPrompt]);

  const handleRequestSetAnnotation = useCallback(() => {
    const menu = cardMenu;
    if (!menu || gameId == null) {
      return;
    }
    setPrompt({
      title: 'Set annotation',
      label: 'Annotation',
      initialValue: menu.card.annotation ?? '',
      onSubmit: (value) => {
        webClient.request.game.bulkSetAnnotation(gameId, menuTargets(menu), value, judgeTarget);
        setPrompt(null);
      },
    });
  }, [cardMenu, judgeTarget, gameId, webClient, menuTargets, setPrompt]);

  const handleRequestSetCardCounter = useCallback((counterId: number) => {
    const menu = cardMenu;
    if (!menu || gameId == null) {
      return;
    }
    const existing = menu.card.counterList.find((c) => c.id === counterId);
    const label = COUNTER_TYPE_LABELS[counterId] ?? String(counterId);
    setPrompt({
      title: `Set ${label} counter`,
      label: 'Counter value',
      initialValue: String(existing?.value ?? 0),
      validate: (v) => (/^-?\d+$/.test(v) ? null : 'Enter an integer'),
      onSubmit: (value) => {
        webClient.request.game.bulkSetCardCounter(gameId, menuTargets(menu), counterId, Number(value), judgeTarget);
        setPrompt(null);
      },
    });
  }, [cardMenu, judgeTarget, gameId, webClient, menuTargets, setPrompt]);

  const handleRequestDrawArrow = useCallback(() => {
    const menu = cardMenu;
    if (!menu) {
      return;
    }
    startPendingArrow({
      sourcePlayerId: menu.sourcePlayerId,
      sourceZone: menu.sourceZone,
      sourceCardId: menu.card.id,
    });
  }, [cardMenu, startPendingArrow]);

  const handleRequestAttach = useCallback(() => {
    const menu = cardMenu;
    if (!menu) {
      return;
    }
    startPendingAttach({
      sourcePlayerId: menu.sourcePlayerId,
      sourceZone: menu.sourceZone,
      sourceCardId: menu.card.id,
    });
  }, [cardMenu, startPendingAttach]);

  // Play-from-card-menu via tablerow logic (boundaries prevent inlining in CardContextMenu).
  const handleRequestPlayFromCardMenu = useCallback(
    (faceDown: boolean) => {
      const menu = cardMenu;
      const game = readGame();
      if (!menu || gameId == null || game == null) {
        return;
      }
      // A judge playing a foreign card wraps as the owner and lands it on the
      // owner's table; own cards send bare (judgeTarget → undefined). See useJudgeTarget.
      void playCardViaTableRow({
        webClient,
        gameId,
        sourcePlayerId: menu.sourcePlayerId,
        sourceZone: menu.sourceZone,
        card: menu.card,
        faceDown,
        isInverted: invertVerticalCoordinate,
        judgeTargetId: judgeTarget(menu.sourcePlayerId),
      });
    },
    [cardMenu, readGame, gameId, invertVerticalCoordinate, judgeTarget, webClient],
  );

  const handleRequestMoveToLibraryAt = useCallback(() => {
    const menu = cardMenu;
    const game = readGame();
    if (!menu || gameId == null || game == null) {
      return;
    }
    // 1-indexed prompt → 0-indexed wire. See .github/instructions/webatrice-game.instructions.md#dialog-parity.
    setPrompt({
      title: 'Move to library at position',
      label: 'Position (1 = top)',
      initialValue: '1',
      validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a positive integer'),
      onSubmit: (value) => {
        // Non-table move routes to the card's owner tree; a judge moving a foreign
        // card wraps as the owner, own cards send bare. See moveTargetPlayerId / useJudgeTarget.
        webClient.request.game.moveCard(gameId, {
          startPlayerId: menu.sourcePlayerId,
          startZone: menu.sourceZone,
          cardsToMove: { card: [{ cardId: menu.card.id }] },
          targetPlayerId: moveTargetPlayerId(menu.sourcePlayerId, ZoneName.DECK, game.localPlayerId),
          targetZone: ZoneName.DECK,
          x: Math.max(0, Number(value) - 1),
          y: 0,
          isReversed: false,
        }, judgeTarget(menu.sourcePlayerId));
        setPrompt(null);
      },
    });
  }, [cardMenu, readGame, gameId, judgeTarget, webClient, setPrompt]);

  return useMemo(
    () => ({
      handleCardContextMenu,
      openSeatCardMenu,
      handleRequestSetPT,
      handleRequestSetAnnotation,
      handleRequestSetCardCounter,
      handleRequestDrawArrow,
      handleRequestAttach,
      handleRequestPlayFromCardMenu,
      handleRequestMoveToLibraryAt,
    }),
    [
      handleCardContextMenu,
      openSeatCardMenu,
      handleRequestSetPT,
      handleRequestSetAnnotation,
      handleRequestSetCardCounter,
      handleRequestDrawArrow,
      handleRequestAttach,
      handleRequestPlayFromCardMenu,
      handleRequestMoveToLibraryAt,
    ],
  );
}
