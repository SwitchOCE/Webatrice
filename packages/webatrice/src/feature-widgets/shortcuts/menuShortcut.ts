import { useCallback } from 'react';

import { shortcuts, useAppSelector } from '@app/store';

import { defaults } from './defaults';
import { displaySequenceForOs, isMacPlatform, parseSequence } from './shortcutSequence';
import { ActionId } from './types';

/** The two shortcut props of a `Menu` entry, spread onto it as one value. */
export interface MenuShortcut {
  /** The first binding as the user reads it ("Ctrl+D", or "⌘D" on a Mac); empty when unbound. */
  shortcut: string;
  /** Every binding in `aria-keyshortcuts` syntax ("Control+D", alternatives separated by spaces). */
  keyShortcuts: string;
}

// `aria-keyshortcuts` names keys by their `KeyboardEvent.key` value; bindings are stored by `code`.
const ARIA_KEY: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  NumpadAdd: 'Plus',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
  NumpadEnter: 'Enter',
};

function ariaKey(code: string): string {
  if (ARIA_KEY[code]) {
    return ARIA_KEY[code];
  }
  if (/^(Key|Digit)[A-Z0-9]$/.test(code)) {
    return code.slice(-1);
  }
  if (/^Numpad\d$/.test(code)) {
    return code.slice(-1);
  }
  return code;
}

function ariaSequence(sequence: string): string {
  const { code, ctrl, alt, shift, meta } = parseSequence(sequence);
  return [ctrl && 'Control', alt && 'Alt', shift && 'Shift', meta && 'Meta', ariaKey(code)]
    .filter(Boolean)
    .join('+');
}

/** The `MenuShortcut` for an action's bindings, in stored `Ctrl+KeyD` form. */
export function toMenuShortcut(sequences: readonly string[], isMac: boolean): MenuShortcut {
  return {
    shortcut: sequences.length > 0 ? displaySequenceForOs(sequences[0], isMac) : '',
    keyShortcuts: sequences.map(ariaSequence).join(' '),
  };
}

/**
 * Returns `menuShortcut(actionId)`, the shortcut props of the menu entry that runs that action,
 * following the user's rebinding in the Shortcuts tab:
 *
 * ```tsx
 * const menuShortcut = useMenuShortcut();
 * <MenuItem onSelect={onDraw} {...menuShortcut('game.drawCard')}>Draw a card</MenuItem>
 * ```
 *
 * Context menus (PR 30's card, zone and player menus) use this rather than writing the display
 * and ARIA strings by hand, so the two never drift apart or from the binding.
 */
export function useMenuShortcut(): (actionId: ActionId) => MenuShortcut {
  const overrides = useAppSelector(shortcuts.Selectors.getOverrides);
  return useCallback(
    (actionId) => toMenuShortcut(overrides[actionId] ?? defaults[actionId]?.sequences ?? [], isMacPlatform()),
    [overrides],
  );
}
