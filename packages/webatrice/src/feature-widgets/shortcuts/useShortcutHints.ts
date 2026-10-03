import { useMemo } from 'react';

import { shortcuts, useAppSelector } from '@app/store';

import { allActionIds, defaults } from './defaults';
import { isMacUA, toMenuShortcut } from './menuShortcut';
import { ActionId } from './types';

/**
 * Reactive shortcut-hint map. Returns a `Record<ActionId, string>` where
 * each value is the display-formatted FIRST sequence for that action
 * (empty string when the action has no binding). Reads
 * `shortcuts.overrides` from Redux so the hints update the moment a
 * user rebinds a shortcut in the Shortcuts tab. The MUI card menu uses
 * it to render the `shortcut:` chip on context-menu items without
 * hardcoding the key names; entries of the a11y `Menu` take
 * `useMenuShortcut` instead, which adds the matching `aria-keyshortcuts`.
 *
 * Mac-symbol formatting (`⌘⇧D`) mirrors Cockatrice desktop's Qt
 * treatment of Ctrl as the primary modifier — Ctrl→⌘, Meta→⌘, Alt→⌥,
 * Shift→⇧. Non-Mac keeps the word form.
 */
export function useShortcutHints(): Record<ActionId, string> {
  const overrides = useAppSelector(shortcuts.Selectors.getOverrides);
  return useMemo(() => {
    const mac = isMacUA();
    const out = {} as Record<ActionId, string>;
    for (const actionId of allActionIds) {
      const sequences = overrides[actionId] ?? defaults[actionId]?.sequences ?? [];
      out[actionId] = toMenuShortcut(sequences, mac).shortcut;
    }
    return out;
  }, [overrides]);
}
