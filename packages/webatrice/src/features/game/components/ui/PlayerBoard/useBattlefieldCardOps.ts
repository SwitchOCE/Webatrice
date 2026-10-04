import { useMemo } from 'react';
import { ZoneName } from '@cockatrice/sockatrice';
import type { LookupResult } from '@app/services';

import type { SeatSelection, SeatSelectionApi } from '../../../hooks/useSeatSelection';
import { createAllRelated } from '../../context-menus/CardContextMenu/relatedCardActions';
import {
  cardIdsOf,
  cloneSource,
  counterStepEntries,
  counterValue,
  currentPT,
  incrementAllCounterEntries,
  ptDeltaEntries,
  resetPTEntries,
  resolveTargets,
  sameSlotIds,
  selectionOrAll,
  totalPower,
  type BattlefieldTargets,
} from './battlefieldSelectionOps';
import type {
  BattlefieldCardViewModel,
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerTargetCommands,
  PlayerZoneCommands,
  SeatMoveDestination,
} from './playerBoard.types';
import { moveSelectedCards } from './selectionMoves';
import type { SeatCardMeta } from './useSeatCardMetadata';
import type { LifeControl, useSeatPrompts } from './useSeatPrompts';

type SeatPrompts = ReturnType<typeof useSeatPrompts>;

export interface UseBattlefieldCardOpsArgs {
  /** The seat's battlefield, in display order. */
  cards: readonly BattlefieldCardViewModel[];
  selection: SeatSelection | null;
  setSelection: SeatSelectionApi['setSelection'];
  cardMetaByName: ReadonlyMap<string, SeatCardMeta>;
  /** Catalog lookups of the related cards (tokens, other faces) by name. */
  tokenMetaByName: ReadonlyMap<string, LookupResult>;
  deckCount: number;
  lifeControl: LifeControl | undefined;
  cardCommands: PlayerCardCommands;
  counterCommands: PlayerCounterCommands;
  targetCommands: PlayerTargetCommands;
  zoneCommands: PlayerZoneCommands;
  prompts: Pick<
    SeatPrompts,
    'openAnnotationPrompt' | 'openPTPrompt' | 'openCardCounterPrompt' | 'openMoveXFromTopPrompt' | 'openTokenCountPrompt'
  >;
  /** Remember the token "Create another token" repeats. */
  setLastToken: SeatPrompts['setLastToken'];
  /** Start an attach pick for these TABLE cards; the first is the arrow's anchor. */
  startAttach: (sourceCardIds: readonly number[], anchorName: string) => void;
  /** Start a draw-arrow pick from this TABLE card. */
  startArrow: (sourceCardId: number, sourceCardName: string) => void;
}

/** The battlefield actions on one target set (see resolveTargets). Tap
 *  flips each card; the other toggles, prompt prefills, the draw-arrow pick,
 *  move-X and the row / column selection follow the anchor; an attach starts
 *  from every card with the anchor carrying the arrow; everything else
 *  applies to every card. */
export interface BattlefieldCardOps {
  /** Tap / Untap (desktop cmTap): flip each card. */
  toggleTapped(): void;
  /** A double-click (desktop TableZone::toggleTapped): tap them all when any
   *  is untapped, else untap them all. */
  tapOrUntapAll(): void;
  toggleFaceDown(): void;
  /** Reveal the face-down cards among the targets to the local player. */
  peek(): void;
  toggleDoesntUntap(): void;
  clone(): void;
  move(to: SeatMoveDestination): void;
  promptMoveXFromTop(): void;
  changePT(deltaP: number, deltaT: number): void;
  promptPT(): void;
  resetPT(): void;
  promptAnnotation(): void;
  attach(): void;
  drawArrow(): void;
  unattach(): void;
  reduceLifeByPower(): void;
  selectRow(): void;
  selectColumn(): void;
  stepCounter(counterId: number, step: 1 | -1): void;
  promptCounter(counterId: number): void;
  /** Create the anchor's related tokens (desktop actCreateAllRelatedCards). */
  createRelatedTokens(): void;
}

export interface BattlefieldCardActions {
  /** The actions of a card menu opened on `cardId`. */
  forCard(cardId: string): BattlefieldCardOps | null;
  /** The actions of a shortcut, on the battlefield selection. */
  forSelection(): BattlefieldCardOps | null;
  selectAll(): void;
  /** +1 on every existing counter of the selection, or of the whole battlefield. */
  incrementAllCounters(): void;
}

/**
 * The seat's battlefield card actions, bound to its ports: the one
 * implementation behind the battlefield card menu and the seat shortcuts.
 * Each action is desktop's PlayerActions handler over the target set
 * (player_actions.cpp), and sends what that handler sends.
 */
export function useBattlefieldCardOps({
  cards,
  selection,
  setSelection,
  cardMetaByName,
  tokenMetaByName,
  deckCount,
  lifeControl,
  cardCommands,
  counterCommands,
  targetCommands,
  zoneCommands,
  prompts,
  setLastToken,
  startAttach,
  startArrow,
}: UseBattlefieldCardOpsArgs): BattlefieldCardActions {
  const { openAnnotationPrompt, openPTPrompt, openCardCounterPrompt, openMoveXFromTopPrompt, openTokenCountPrompt } = prompts;

  return useMemo(() => {
    const printedPT = (name: string) => cardMetaByName.get(name)?.pt ?? '';
    const select = (ids: Set<string>) => {
      if (ids.size > 0) {
        setSelection({ zone: 'battlefield', ids });
      }
    };
    // One command container for every card's counter.
    const setCounters = (entries: { cardId: number; counterId: number; value: number }[]) => {
      if (entries.length > 0) {
        counterCommands.setCardCounters(entries);
      }
    };

    const opsFor = (targets: BattlefieldTargets | null): BattlefieldCardOps | null => {
      if (!targets) {
        return null;
      }
      const { cards: targetCards, anchor } = targets;
      const targetIds = cardIdsOf(targetCards);
      const anchorId = Number(anchor.id);
      const anchorNumeric = Number.isFinite(anchorId);
      const each = (send: (cardId: number) => void) => targetIds.forEach(send);
      const setPT = (entries: { cardId: number; pt: string }[]) => {
        if (entries.length > 0) {
          cardCommands.setPT(entries);
        }
      };
      // The prompts take a snapshot of the target ids, so a selection change
      // while one is open does not move its targets.
      const prompt = (open: (promptTargets: { targetIds: number[]; cardName: string }) => void) => {
        if (targetIds.length > 0) {
          open({ targetIds, cardName: anchor.name });
        }
      };

      return {
        // Desktop cmTap flips each card (1 - tapped, player_actions.cpp:1768-1776):
        // a mixed selection taps the untapped cards and untaps the tapped ones.
        toggleTapped: () => {
          for (const tapped of [false, true]) {
            const ids = cardIdsOf(targetCards.filter((c) => Boolean(c.tapped) === tapped));
            if (ids.length > 0) {
              cardCommands.setTapped(ids, !tapped);
            }
          }
        },
        // table_zone.cpp:250-280: only the cards whose state changes.
        tapOrUntapAll: () => {
          const tapAll = targetCards.some((c) => !c.tapped);
          const ids = cardIdsOf(targetCards.filter((c) => Boolean(c.tapped) !== tapAll));
          if (ids.length > 0) {
            cardCommands.setTapped(ids, tapAll);
          }
        },
        toggleFaceDown: () => each((id) => cardCommands.flip(id, !anchor.faceDown)),
        peek: () => {
          const faceDownIds = cardIdsOf(targetCards.filter((c) => c.faceDown));
          if (cardCommands.peek && faceDownIds.length > 0) {
            cardCommands.peek(faceDownIds);
          }
        },
        toggleDoesntUntap: () => each((id) => cardCommands.setDoesntUntap(id, !anchor.doesntUntap)),
        // One Command_CreateToken per card (desktop cmClone).
        clone: () => targetCards.forEach((c) => {
          if (Number.isFinite(Number(c.id))) {
            cardCommands.clone(cloneSource(c));
          }
        }),
        // One Command_MoveCard for every target (cards_to_move is repeated).
        move: (to) => moveSelectedCards(zoneCommands.moveCards, ZoneName.TABLE, targetCards, to, (name) => cardMetaByName.get(name)),
        promptMoveXFromTop: () => {
          if (anchorNumeric) {
            openMoveXFromTopPrompt({ cardIds: [anchorId], cardName: anchor.name, deckSize: deckCount });
          }
        },
        changePT: (deltaP, deltaT) => setPT(ptDeltaEntries(targetCards, printedPT, deltaP, deltaT)),
        promptPT: () => prompt((t) => openPTPrompt({ ...t, current: currentPT(anchor, printedPT) })),
        resetPT: () => setPT(resetPTEntries(targetCards, printedPT)),
        promptAnnotation: () => prompt((t) => openAnnotationPrompt({ ...t, current: anchor.annotation ?? '' })),
        // Desktop attaches every target; the anchor carries the arrow. An
        // optimistic placeholder anchor hands the arrow to the first target
        // with a server id.
        attach: () => {
          const sourceIds = anchorNumeric ? [anchorId, ...targetIds.filter((id) => id !== anchorId)] : targetIds;
          if (sourceIds.length > 0) {
            const arrowCard = targetCards.find((c) => Number(c.id) === sourceIds[0]) ?? anchor;
            startAttach(sourceIds, arrowCard.name);
          }
        },
        drawArrow: () => {
          if (anchorNumeric) {
            startArrow(anchorId, anchor.name);
          }
        },
        // Command_AttachCard has no batch form; the server ignores cards that
        // are not attached.
        unattach: () => each((id) => targetCommands.unattach(id)),
        // On an opponent's seat lifeControl carries the shared life counter id,
        // so this lowers the local player's life, as desktop does.
        reduceLifeByPower: () => {
          const total = totalPower(targetCards);
          if (total > 0) {
            lifeControl?.onDelta(-total);
          }
        },
        selectRow: () => select(sameSlotIds(cards, anchor, 'row')),
        selectColumn: () => select(sameSlotIds(cards, anchor, 'col')),
        stepCounter: (counterId, step) => setCounters(counterStepEntries(targetCards, counterId, step)),
        promptCounter: (counterId) =>
          prompt((t) => openCardCounterPrompt({ ...t, counterId, currentValue: counterValue(anchor, counterId) })),
        // Desktop acts on the active card only, the anchor here.
        createRelatedTokens: () => {
          const meta = cardMetaByName.get(anchor.name);
          const { requests, prompt: countPrompt, lastToken } = createAllRelated({
            related: meta?.related ?? [],
            tokenMeta: tokenMetaByName,
            parentMeta: meta,
            sourceCardId: anchorNumeric ? anchorId : undefined,
            parentName: anchor.name,
          });
          requests.forEach((request) => cardCommands.createToken(request));
          // Desktop remembers it even when the count prompt is cancelled.
          if (lastToken) {
            setLastToken(lastToken);
          }
          if (countPrompt) {
            openTokenCountPrompt({ request: countPrompt.request, initial: countPrompt.defaultCount });
          }
        },
      };
    };

    return {
      forCard: (cardId) => opsFor(resolveTargets(cards, selection, cardId)),
      forSelection: () => opsFor(resolveTargets(cards, selection)),
      selectAll: () => select(new Set(cards.map((c) => c.id))),
      incrementAllCounters: () => setCounters(incrementAllCounterEntries(selectionOrAll(cards, selection))),
    };
  }, [
    cards, selection, setSelection, cardMetaByName, tokenMetaByName, deckCount, lifeControl, cardCommands, counterCommands,
    targetCommands, zoneCommands, openAnnotationPrompt, openPTPrompt, openCardCounterPrompt, openMoveXFromTopPrompt,
    openTokenCountPrompt, setLastToken, startAttach, startArrow,
  ]);
}
