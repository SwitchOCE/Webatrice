// The seat's numeric and text prompts, as PromptState for the game's one
// PromptDialog (refactor plan PB-12). Each builder owns its prompt's defaults,
// validation and parsing, and hands the caller a typed value; useGameDialogs'
// `openPrompt` shows it and closes it after submit. Labels and clamps mirror
// the desktop dialogs named on each builder.

import { evalLifeExpression } from '../../components/right-sidebar/PlayerInfoPanel/lifeExpression';
import type { PromptState } from './gameDialogs.types';
import type { TFunction } from 'i18next';

const INTEGER = /^-?\d+$/;

/** Parses a whole number the way the old seat modals did (`parseInt`), or null. */
function parseWhole(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export interface ExpressionPromptArgs {
  current: number;
  onSubmit: (value: number) => void;
  /** Defaults to the life total's title and label. */
  title?: string;
  label?: string;
  description?: string;
}

/**
 * A life total or player counter, typed as a number or arithmetic
 * (`40+10`); the evaluated value shows under the field. Desktop
 * `PlayerActions::actSetLife` / `AbstractCounter::setCounter` take a number;
 * the sum is a webclient convenience.
 */
export function expressionPrompt(t: TFunction, { current, onSubmit, title, label, description }: ExpressionPromptArgs): PromptState {
  return {
    title: title ?? t('GamePrompt.life.title'),
    label: label ?? t('GamePrompt.life.label'),
    description: description ?? t('GamePrompt.life.description'),
    initialValue: String(current),
    submitLabel: t('GamePrompt.action.save'),
    inputMode: 'numeric',
    selectOnFocus: true,
    preview: (value) => {
      const result = evalLifeExpression(value);
      return result == null || INTEGER.test(value.trim()) ? null : `= ${result}`;
    },
    validate: (value) => (evalLifeExpression(value) == null ? t('GamePrompt.life.invalid') : null),
    onSubmit: (value) => onSubmit(evalLifeExpression(value)!),
  };
}

export interface CardTextPromptArgs {
  cardName: string;
  current: string;
  onSubmit: (value: string) => void;
}

/** Desktop `actRequestSetPTDialog`: free-form, `+1/+1` style deltas allowed, blank clears. */
export function powerToughnessPrompt(t: TFunction, { cardName, current, onSubmit }: CardTextPromptArgs): PromptState {
  return {
    title: t('GamePrompt.powerToughness.title'),
    label: t('GamePrompt.powerToughness.label'),
    description: cardName,
    initialValue: current,
    placeholder: t('GamePrompt.powerToughness.placeholder'),
    submitLabel: t('GamePrompt.action.save'),
    selectOnFocus: true,
    onSubmit,
  };
}

/** Desktop `actRequestSetAnnotationDialog`: blank clears the annotation. */
export function annotationPrompt(t: TFunction, { cardName, current, onSubmit }: CardTextPromptArgs): PromptState {
  return {
    title: t('GamePrompt.annotation.title'),
    label: t('GamePrompt.annotation.label'),
    description: cardName,
    initialValue: current,
    placeholder: t('GamePrompt.annotation.placeholder'),
    submitLabel: t('GamePrompt.action.save'),
    selectOnFocus: true,
    onSubmit,
  };
}

export interface CardCounterPromptArgs {
  cardName: string;
  /** The counter's letter, A–F. */
  counterLetter: string;
  current: number;
  onSubmit: (value: number) => void;
}

/** Desktop `actRequestSetCardCounterDialog` (player_actions.cpp:1555): a value of 0 or more. */
export function cardCounterPrompt(t: TFunction, { cardName, counterLetter, current, onSubmit }: CardCounterPromptArgs): PromptState {
  return {
    title: t('GamePrompt.counter.title', { counter: counterLetter }),
    label: t('GamePrompt.counter.label'),
    description: cardName,
    initialValue: String(current),
    submitLabel: t('GamePrompt.action.set'),
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      const n = parseWhole(value);
      return n == null || n < 0 ? t('GamePrompt.validation.zeroOrMore') : null;
    },
    onSubmit: (value) => onSubmit(parseWhole(value)!),
  };
}

export interface LibraryCountPromptArgs {
  title: string;
  submitLabel: string;
  /** Cards in the library; the answer is clamped to it. */
  deckSize: number;
  initial: number;
  onSubmit: (count: number) => void;
}

/**
 * How many library cards: view / draw / move / shuffle / reveal the top or
 * bottom N. One or more, clamped to the library size before `onSubmit`, as
 * desktop clamps to `getDeckZone()->getCards().size()`.
 */
export function libraryCountPrompt(t: TFunction, { title, submitLabel, deckSize, initial, onSubmit }: LibraryCountPromptArgs): PromptState {
  const size = Math.max(0, deckSize);
  return {
    title,
    label: t('GamePrompt.library.numberOfCards'),
    description: t('MoveTopUntilDialog.librarySize', { count: size }),
    initialValue: String(initial),
    submitLabel,
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      if (size <= 0) {
        return t('GamePrompt.library.empty');
      }
      const n = parseWhole(value);
      return n == null || n < 1 ? t('GamePrompt.validation.oneOrMore') : null;
    },
    onSubmit: (value) => onSubmit(Math.min(parseWhole(value)!, size)),
  };
}

export interface MoveXFromTopPromptArgs {
  cardName: string;
  deckSize: number;
  initial: number;
  onSubmit: (position: number) => void;
}

/**
 * Desktop `actRequestMoveCardXCardsFromTopDialog` (player_actions.cpp:1220):
 * the library position to put the card at, 0 = top, clamped to the library size.
 */
export function moveXFromTopPrompt(t: TFunction, { cardName, deckSize, initial, onSubmit }: MoveXFromTopPromptArgs): PromptState {
  const size = Math.max(0, deckSize);
  return {
    title: t('GamePrompt.library.moveFromTopTitle'),
    label: t('GamePrompt.library.position', { count: size }),
    description: cardName,
    initialValue: String(initial),
    submitLabel: t('ZoneMenu.actionMove'),
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      const n = parseWhole(value);
      return n == null || n < 0 ? t('GamePrompt.validation.zeroOrMore') : null;
    },
    onSubmit: (value) => onSubmit(Math.min(parseWhole(value)!, size)),
  };
}

/** Desktop MAX_TOKENS_PER_DIALOG (player_logic.h:62). */
export const MAX_TOKENS_PER_PROMPT = 99;

export interface TokenCountPromptArgs {
  tokenName: string;
  initial: number;
  onSubmit: (count: number) => void;
}

/**
 * How many of a variable-count ("x") related token to create: desktop
 * PlayerDialogs::onCreateRelatedFromRelationDialogRequested
 * (player_dialogs.cpp:198-213) asks "Create tokens / Number:" from 1 to 99,
 * seeded with the relation's default count.
 */
export function tokenCountPrompt({ tokenName, initial, onSubmit }: TokenCountPromptArgs): PromptState {
  return {
    title: 'Create tokens',
    label: 'Number',
    description: tokenName,
    initialValue: String(initial),
    submitLabel: 'Create',
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      const n = parseWhole(value);
      return n == null || n < 1 || n > MAX_TOKENS_PER_PROMPT ? `Enter 1 to ${MAX_TOKENS_PER_PROMPT}` : null;
    },
    onSubmit: (value) => onSubmit(parseWhole(value)!),
  };
}
