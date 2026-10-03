import { useRef, useState } from 'react';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import {
  annotationPrompt,
  cardCounterPrompt,
  expressionPrompt,
  libraryCountPrompt,
  moveXFromTopPrompt,
  powerToughnessPrompt,
} from '../../../hooks/dialogs/seatPrompts';
import { applyPTSet } from '../../context-menus/CardContextMenu/cardAttributeEdits';
import { useGameDialogsContext } from '../GameDialogsContext';
import type {
  BattlefieldCardViewModel,
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerZoneCommands,
} from './playerBoard.types';
import { toRecipient } from './revealRecipient';
import type { SeatCardMeta } from './useSeatCardMetadata';

/** Card counter letters by counter id (desktop's six counter slots). */
const COUNTER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** The cards a card prompt applies to, and the clicked card that seeds it. */
export interface PromptTargets {
  targetIds: number[];
  cardName: string;
  current: string;
}

/** The "life" counter as the seat drives it: a delta for +/-, a value to set. */
export interface LifeControl {
  value: number;
  onDelta: (delta: number) => void;
  onSet: (value: number) => void;
}

export interface UseSeatPromptsArgs {
  seatId: number;
  /** Undefined until the player's life counter exists. */
  lifeControl: LifeControl | undefined;
  battlefieldCards: readonly BattlefieldCardViewModel[];
  cardMetaByName: ReadonlyMap<string, SeatCardMeta>;
  /** Draws `n` cards from this seat's library. */
  draw: (n: number) => void;
  zoneCommands: PlayerZoneCommands;
  cardCommands: PlayerCardCommands;
  counterCommands: PlayerCounterCommands;
}

/**
 * The seat's prompts, opened through the game dialogs: life and player
 * counters, P/T, annotations and card counters, the library count prompts and
 * the create-token dialog (which remembers the last token for "Create another
 * token"). Also owns the life total the info column shows.
 */
export function useSeatPrompts({
  seatId,
  lifeControl,
  battlefieldCards: battlefieldDisplayList,
  cardMetaByName,
  draw,
  zoneCommands,
  cardCommands,
  counterCommands,
}: UseSeatPromptsArgs) {
  const { openZoneView, openPrompt, openCreateToken } = useGameDialogsContext();

  // Life total — starts at Commander 40. Only mutable by the owning
  // player; opponents render the number read-only. Capped at 9999 so
  // the number can't overflow the display box or (more importantly)
  // push the info column into an obviously silly state.
  const LIFE_MAX = 9999;
  // Fallback local life state — only used when no `lifeControl` prop
  // is passed (transient pre-hydration or when the player's life
  // counter hasn't landed in Redux yet).
  const [localLife, setLocalLifeState] = useState(40);
  const life = lifeControl ? lifeControl.value : localLife;
  const setLife = (next: number | ((prev: number) => number)) => {
    if (lifeControl) {
      // Controlled: compute the target value + delta and dispatch.
      // Callers that pass a plain number → `onSet`; callers that pass
      // a `(prev) => next` function get their delta forwarded via
      // `onDelta` so downstream selectors can decide whether to emit
      // an inc- or set-counter command (usually inc for the ±1 hover
      // paths, set for the edit-mode input).
      if (typeof next === 'function') {
        const target = Math.min(LIFE_MAX, Math.trunc(next(life)));
        lifeControl.onDelta(target - life);
      } else {
        lifeControl.onSet(Math.min(LIFE_MAX, Math.trunc(next)));
      }
      return;
    }
    setLocalLifeState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      return Math.min(LIFE_MAX, Math.trunc(raw));
    });
  };
  // Set life (Ctrl+L, Counters → Life) and the mana / storm counters'
  // "Set counter..." share the game's sum prompt. Command_SetCounter takes
  // the absolute value; Servatrice clamps it, and player counters floor at 0.
  const openLifePrompt = () => openPrompt(expressionPrompt({ current: life, onSubmit: (value) => setLife(value) }));
  const openCounterPrompt = ({ counterId, label, currentValue }: {
    counterId: number;
    label: string;
    currentValue: number;
  }) => openPrompt(expressionPrompt({
    current: currentValue,
    title: `Set ${label.toLowerCase()} counter`,
    label,
    description: `Current: ${currentValue}`,
    onSubmit: (value) => counterCommands.set(counterId, Math.max(0, value)),
  }));
  // Set annotation / Set P/T prompts. The target ids are snapshotted when
  // the prompt opens, so the answer applies to every card that was selected
  // then, even if the selection changes meanwhile (Cockatrice's
  // cardMenuAction pattern); a single right-click carries just that card.
  // Each P/T target uses ITS OWN current P/T as the applyPTSet base, read at
  // submit time (so `+1/+1` bumps a 2/2 to 3/3 and a 4/5 to 5/6 in one
  // atomic cardCommands.setPT batch, like desktop's actSetPT loop).
  const ptBaseRef = useRef({ battlefieldDisplayList, cardMetaByName });
  ptBaseRef.current = { battlefieldDisplayList, cardMetaByName };
  const openAnnotationPrompt = ({ targetIds, cardName, current }: PromptTargets) =>
    openPrompt(annotationPrompt({
      cardName,
      current,
      // No bulk-annotation wire: one Command_SetCardAttr per card, as
      // desktop's actSetAnnotation iterates selectedCards.
      onSubmit: (value) => {
        for (const id of targetIds) {
          cardCommands.setAnnotation(id, value);
        }
      },
    }));
  const openPTPrompt = ({ targetIds, cardName, current }: PromptTargets) =>
    openPrompt(powerToughnessPrompt({
      cardName,
      current,
      onSubmit: (value) => {
        const { battlefieldDisplayList: board, cardMetaByName: meta } = ptBaseRef.current;
        const entries = targetIds.map((id) => {
          const bc = board.find((x) => Number(x.id) === id);
          const base = bc?.pt || (bc ? meta.get(bc.name)?.pt ?? '' : '');
          return { cardId: id, pt: applyPTSet(base, value) };
        });
        if (entries.length > 0) {
          cardCommands.setPT(entries);
        }
      },
    }));
  // "X cards from the top of library..." prompt: Command_MoveCard with x = N
  // puts the card at position N of the library. The library size is
  // snapshotted when it opens, so a draw meanwhile doesn't move the clamp.
  const openMoveXFromTopPrompt = ({ cardIds, cardName, deckSize, fromZone = ZoneName.TABLE }: {
    cardIds: number[];
    cardName: string;
    deckSize: number;
    fromZone?: ZoneNameValue;
  }) =>
    openPrompt(moveXFromTopPrompt({
      cardName,
      deckSize,
      initial: Math.min(3, Math.max(0, deckSize)),
      onSubmit: (position) => zoneCommands.moveCards(fromZone, cardIds, { zone: ZoneName.DECK, index: position, reversed: false }),
    }));
  // Library count prompts: Draw cards..., View top / bottom cards..., Reveal
  // top cards to..., and the Top / Bottom of library "N cards" items. Each
  // snapshots the library size when it opens and clamps the answer to it, so
  // a concurrent draw doesn't move the goalposts while the user types.
  // Defaults: 1 for Draw cards (desktop's actRequestDrawCardsDialog), else 3.
  const countDefault = (deckSize: number) => Math.min(3, Math.max(1, deckSize));
  const openCountPrompt = ({ title, submitLabel, deckSize, onSubmit }: {
    title: string;
    submitLabel: string;
    deckSize: number;
    onSubmit: (n: number) => void;
  }) => openPrompt(libraryCountPrompt({ title, submitLabel, deckSize, initial: countDefault(deckSize), onSubmit }));
  const openDrawCardsPrompt = ({ deckSize }: { deckSize: number }) =>
    openPrompt(libraryCountPrompt({ title: 'Draw cards', submitLabel: 'Draw', deckSize, initial: 1, onSubmit: (n) => draw(n) }));
  // View top / bottom: Command_DumpZone for N cards, then the zone view opens
  // on the revealed snapshot (desktop actViewTopCards / actViewBottomCards).
  const openViewLibraryCountPrompt = ({ isReversed, deckSize }: { isReversed: boolean; deckSize: number }) =>
    openCountPrompt({
      title: isReversed ? 'View bottom cards of library' : 'View top cards of library',
      submitLabel: 'View',
      deckSize,
      onSubmit: (n) => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK, numberCards: n, isReversed }),
    });
  // Reveal top N to a player: Command_RevealCards via onRevealTopCards
  // (`-1` = all players, sent with no player_id).
  const openRevealTopCardsPrompt = ({ targetPlayerId, targetName, deckSize }: {
    targetPlayerId: number;
    targetName: string;
    deckSize: number;
  }) => openCountPrompt({
    title: `Reveal top cards of library to ${targetName}`,
    submitLabel: 'View',
    deckSize,
    onSubmit: (n) => zoneCommands.reveal(ZoneName.DECK, toRecipient(targetPlayerId), { top: n }),
  });

  // "Set counters (X)..." prompt, seeded with the clicked (or first
  // selected) card's value. The target ids are snapshotted when it opens;
  // the answer goes to every one of them in one atomic CommandContainer, as
  // desktop's actSetCardCounter batches per-card SetCardCounter.
  const openCardCounterPrompt = ({ targetIds, cardName, counterId, currentValue }: {
    targetIds: number[];
    cardName: string;
    counterId: number;
    currentValue: number;
  }) => openPrompt(cardCounterPrompt({
    cardName,
    counterLetter: COUNTER_LETTERS[counterId] ?? String(counterId),
    current: currentValue,
    onSubmit: (value) => {
      counterCommands.setCardCounters(targetIds.map((id) => ({ cardId: id, counterId, value: Math.max(0, value) })));
    },
  }));
  // Last successfully-submitted token — powers "Create another token"
  // (Cockatrice's actCreateAnotherToken, player_actions.cpp:894-916).
  // Persisted across the dialog's open/close cycle so a subsequent
  // right-click → "Create another token" re-fires with the same args.
  const [lastToken, setLastToken] = useState<{
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
  } | null>(null);
  // "Create token..." opens the game's CreateTokenDialog seeded with the
  // last token (an "edit last token" flow). The token goes through this
  // seat's card port (onCreateToken: the local battlefield, tablerow y) and
  // becomes the new last token.
  const openCreateTokenDialog = () => openCreateToken({
    initial: lastToken,
    onSubmit: (token) => {
      setLastToken(token);
      cardCommands.createToken(token);
    },
  });

  return {
    life,
    setLife,
    openLifePrompt,
    openCounterPrompt,
    openAnnotationPrompt,
    openPTPrompt,
    openMoveXFromTopPrompt,
    openCountPrompt,
    openDrawCardsPrompt,
    openViewLibraryCountPrompt,
    openRevealTopCardsPrompt,
    openCardCounterPrompt,
    lastToken,
    openCreateTokenDialog,
  };
}
