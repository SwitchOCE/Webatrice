// The seat's numeric and text prompts, as PromptState for the game's one
// PromptDialog (refactor plan PB-12). Each builder owns its prompt's defaults,
// validation and parsing, and hands the caller a typed value; useGameDialogs'
// `openPrompt` shows it and closes it after submit. Labels and clamps mirror
// the desktop dialogs named on each builder.

import { evalLifeExpression } from '../../components/right-sidebar/PlayerInfoPanel/lifeExpression';
import type { PromptState } from './gameDialogs.types';

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
export function expressionPrompt({ current, onSubmit, title, label, description }: ExpressionPromptArgs): PromptState {
  return {
    title: title ?? 'Set life total',
    label: label ?? 'Life total',
    description: description ?? 'Numbers or math (e.g. 40+10)',
    initialValue: String(current),
    submitLabel: 'Save',
    inputMode: 'numeric',
    selectOnFocus: true,
    preview: (value) => {
      const result = evalLifeExpression(value);
      return result == null || INTEGER.test(value.trim()) ? null : `= ${result}`;
    },
    validate: (value) => (evalLifeExpression(value) == null ? 'Enter a number or a sum like 40+10' : null),
    onSubmit: (value) => onSubmit(evalLifeExpression(value)!),
  };
}

export interface CardTextPromptArgs {
  cardName: string;
  current: string;
  onSubmit: (value: string) => void;
}

/** Desktop `actRequestSetPTDialog`: free-form, `+1/+1` style deltas allowed, blank clears. */
export function powerToughnessPrompt({ cardName, current, onSubmit }: CardTextPromptArgs): PromptState {
  return {
    title: 'Set power and toughness',
    label: 'Power / toughness',
    description: cardName,
    initialValue: current,
    placeholder: 'e.g. 3/4, +1/+1, or blank to clear',
    submitLabel: 'Save',
    selectOnFocus: true,
    onSubmit,
  };
}

/** Desktop `actRequestSetAnnotationDialog`: blank clears the annotation. */
export function annotationPrompt({ cardName, current, onSubmit }: CardTextPromptArgs): PromptState {
  return {
    title: 'Set annotation',
    label: 'Annotation',
    description: cardName,
    initialValue: current,
    placeholder: 'Leave blank to clear',
    submitLabel: 'Save',
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
export function cardCounterPrompt({ cardName, counterLetter, current, onSubmit }: CardCounterPromptArgs): PromptState {
  return {
    title: `Set counter ${counterLetter}`,
    label: 'Counter value',
    description: cardName,
    initialValue: String(current),
    submitLabel: 'Set',
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      const n = parseWhole(value);
      return n == null || n < 0 ? 'Enter 0 or more' : null;
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
export function libraryCountPrompt({ title, submitLabel, deckSize, initial, onSubmit }: LibraryCountPromptArgs): PromptState {
  const size = Math.max(0, deckSize);
  return {
    title,
    label: 'Number of cards',
    description: `Library size: ${size}`,
    initialValue: String(initial),
    submitLabel,
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      if (size <= 0) {
        return 'The library is empty';
      }
      const n = parseWhole(value);
      return n == null || n < 1 ? 'Enter 1 or more' : null;
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
export function moveXFromTopPrompt({ cardName, deckSize, initial, onSubmit }: MoveXFromTopPromptArgs): PromptState {
  const size = Math.max(0, deckSize);
  return {
    title: 'Move X cards from the top of library',
    label: `Place at position (0 = top, ${size} = bottom)`,
    description: cardName,
    initialValue: String(initial),
    submitLabel: 'Move',
    type: 'number',
    selectOnFocus: true,
    validate: (value) => {
      const n = parseWhole(value);
      return n == null || n < 0 ? 'Enter 0 or more' : null;
    },
    onSubmit: (value) => onSubmit(Math.min(parseWhole(value)!, size)),
  };
}
