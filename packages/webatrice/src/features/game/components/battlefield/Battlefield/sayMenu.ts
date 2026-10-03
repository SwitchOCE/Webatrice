import type { ActionId, useShortcutHints } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';

type ShortcutHints = ReturnType<typeof useShortcutHints>;

/** The Say shortcut of each of the first ten macros (desktop's Ctrl+1 … Ctrl+0). */
export const SAY_MACRO_ACTIONS = [
  'game.sayMacro1',
  'game.sayMacro2',
  'game.sayMacro3',
  'game.sayMacro4',
  'game.sayMacro5',
  'game.sayMacro6',
  'game.sayMacro7',
  'game.sayMacro8',
  'game.sayMacro9',
  'game.sayMacro10',
] as const satisfies readonly ActionId[];

/**
 * The "Say" submenu: one item per message macro, sent verbatim as game chat
 * (desktop SayMenu, say_menu.cpp); disabled while there are none.
 */
export function buildSayMenu(
  macros: readonly string[],
  shortcutHints: ShortcutHints,
  onSay: (message: string) => void,
): ContextMenuItem {
  return {
    label: 'Say',
    disabled: macros.length === 0,
    submenu: macros.map((message, i) => ({
      label: message,
      shortcut: i < SAY_MACRO_ACTIONS.length ? shortcutHints[SAY_MACRO_ACTIONS[i]] : undefined,
      onClick: () => onSay(message),
    })),
  };
}
