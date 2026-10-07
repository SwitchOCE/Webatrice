import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import type { PlayerZoneCommands, SeatMoveCard, SeatMoveDestination } from './playerBoard.types';
import type { useSeatPrompts } from './useSeatPrompts';

type SeatPrompts = ReturnType<typeof useSeatPrompts>;

export interface UseLibraryOpsArgs {
  /** The library size the server reports. */
  deckCount: number;
  openCountPrompt: SeatPrompts['openCountPrompt'];
  zoneCommands: PlayerZoneCommands;
}

/** The library's top and bottom card actions (desktop LibraryMenu's Top of
 *  library / Bottom of library submenus). Each does nothing on an empty library. */
export interface LibraryOps {
  /** Move the top card (desktop cmdSetTopCard: card id 0). */
  moveTopCard(to: ZoneNameValue, index: SeatMoveDestination['index'], faceDown?: boolean): void;
  /** Move the bottom card (desktop cmdSetBottomCard: card id deckCount - 1). */
  moveBottomCard(to: ZoneNameValue, index: SeatMoveDestination['index'], faceDown?: boolean): void;
  /** Ask how many, then move that many top cards (titled by libraryMovePrompt). */
  promptMoveTopCards(to: ZoneNameValue, faceDown?: boolean): void;
  /** Ask how many, then move that many bottom cards (titled by libraryMovePrompt). */
  promptMoveBottomCards(to: ZoneNameValue, faceDown?: boolean): void;
  /** Ask how many, then shuffle that many top cards. */
  promptShuffleTopCards(): void;
  /** Ask how many, then shuffle that many bottom cards. */
  promptShuffleBottomCards(): void;
}

/**
 * The count prompt's title and submit label for moving the top or bottom
 * cards of the library, the same from the library menu and the shortcuts.
 * Desktop titles it "Move top cards to <zone>" whether or not the cards go
 * face down, and "Draw bottom cards" into the hand (player_dialogs.cpp:138,162,174).
 */
export function libraryMovePrompt(
  t: TFunction,
  end: 'top' | 'bottom',
  to: ZoneNameValue,
): { title: string; submitLabel: string } {
  if (to === ZoneName.HAND) {
    return {
      title: end === 'top' ? t('ZoneMenu.promptDrawTop') : t('ZoneMenu.promptDrawBottom'),
      submitLabel: t('ZoneMenu.actionDraw'),
    };
  }
  const target = t(`ZoneLabel.title.${to}`);
  return {
    title: end === 'top' ? t('ZoneMenu.promptMoveTop', { target }) : t('ZoneMenu.promptMoveBottom', { target }),
    submitLabel: t('ZoneMenu.actionMove'),
  };
}

/**
 * The seat's library actions, bound to its zone port: the one implementation
 * behind the library menu and the Move top card / Move bottom card shortcuts.
 * Each sends what desktop's PlayerActions handler sends (player_actions.cpp).
 */
export function useLibraryOps({ deckCount, openCountPrompt, zoneCommands }: UseLibraryOpsArgs): LibraryOps {
  const { t } = useTranslation();
  return useMemo(() => {
    const card = (id: number, faceDown?: boolean): SeatMoveCard => (faceDown ? { id, faceDown: true } : id);
    // A count prompt over the library, clamped to its size.
    const promptCount = (
      { title, submitLabel }: { title: string; submitLabel: string },
      onCount: (count: number, size: number) => void,
    ) => {
      const size = deckCount;
      if (size <= 0) {
        return;
      }
      openCountPrompt({
        title,
        submitLabel,
        deckSize: size,
        onSubmit: (n) => {
          const count = Math.min(n, size);
          if (count > 0) {
            onCount(count, size);
          }
        },
      });
    };

    return {
      moveTopCard: (to, index, faceDown) => {
        if (deckCount > 0) {
          zoneCommands.moveCards(ZoneName.DECK, [card(0, faceDown)], { zone: to, index });
        }
      },
      moveBottomCard: (to, index, faceDown) => {
        if (deckCount > 0) {
          zoneCommands.moveCards(ZoneName.DECK, [card(deckCount - 1, faceDown)], { zone: to, index });
        }
      },
      // Iterates i in [N-1..0], moveTopCardsTo's order (player_actions.cpp:475).
      promptMoveTopCards: (to, faceDown) => promptCount(libraryMovePrompt(t, 'top', to), (count) => {
        const cards: SeatMoveCard[] = [];
        for (let i = count - 1; i >= 0; i--) {
          cards.push(card(i, faceDown));
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: to });
      }),
      // Iterates i in [size-N..size-1], moveBottomCardsTo's order
      // (player_actions.cpp:673) and actDrawBottomCards' (:798).
      promptMoveBottomCards: (to, faceDown) => promptCount(libraryMovePrompt(t, 'bottom', to), (count, size) => {
        const cards: SeatMoveCard[] = [];
        for (let i = size - count; i < size; i++) {
          cards.push(card(i, faceDown));
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: to });
      }),
      // Command_Shuffle's range is inclusive: [0, N-1] shuffles positions
      // 0..N-1 (player_actions.cpp:267-268).
      promptShuffleTopCards: () => promptCount(
        { title: t('ZoneMenu.promptShuffleTop'), submitLabel: t('ZoneMenu.actionShuffle') },
        (count) =>
          zoneCommands.shuffleLibrary({ start: 0, end: count - 1 })),
      // `[-N, -1]`: negative positions count from the bottom (desktop always
      // sends negative for the bottom, player_actions.cpp:298-299).
      promptShuffleBottomCards: () => promptCount(
        { title: t('ZoneMenu.promptShuffleBottom'), submitLabel: t('ZoneMenu.actionShuffle') },
        (count) =>
          zoneCommands.shuffleLibrary({ start: -count, end: -1 })),
    };
  }, [deckCount, openCountPrompt, t, zoneCommands]);
}
