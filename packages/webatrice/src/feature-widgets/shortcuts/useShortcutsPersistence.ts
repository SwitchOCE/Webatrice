import { useEffect, useRef } from 'react';

import { LoadingState, useSettings } from '@app/hooks';
import { shortcuts, useAppSelector } from '@app/store';

import { changedBindings } from './shortcutChanges';

export function useShortcutsPersistence(): void {
  const settings = useSettings();
  const hydrated = useAppSelector(shortcuts.Selectors.getHydrated);
  const overrides = useAppSelector(shortcuts.Selectors.getOverrides);
  const lastSeenOverrides = useRef<typeof overrides | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (settings.status !== LoadingState.READY) {
      return;
    }
    if (lastSeenOverrides.current === null) {
      lastSeenOverrides.current = overrides;
      return;
    }
    if (lastSeenOverrides.current === overrides) {
      return;
    }
    const changed = changedBindings(lastSeenOverrides.current, overrides);
    lastSeenOverrides.current = overrides;
    const persisted = settings.value?.shortcuts ?? {};
    const differing = new Set(changedBindings(persisted, overrides));
    const localChanges = changed.filter((id) => differing.has(id));
    if (!localChanges.length) {
      return;
    }
    const patch = Object.fromEntries(localChanges.map((id) => [id, overrides[id]]));
    void settings.update((current) => {
      const next = { ...current.shortcuts };
      for (const [id, sequences] of Object.entries(patch)) {
        if (sequences === undefined) {
          delete next[id];
        } else {
          next[id] = sequences;
        }
      }
      return { shortcuts: next };
    });
  }, [hydrated, overrides, settings]);
}
