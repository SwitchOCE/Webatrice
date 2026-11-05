import { useEffect, useRef } from 'react';

import { LoadingState, useSettings } from '@app/hooks';
import { shortcuts, useAppDispatch, useAppSelector } from '@app/store';

import { changedBindings } from './shortcutChanges';

export function useShortcutsHydration(): void {
  const dispatch = useAppDispatch();
  const settings = useSettings();
  const hydrated = useAppSelector(shortcuts.Selectors.getHydrated);

  const lastSettings = useRef(useAppSelector(shortcuts.Selectors.getOverrides));

  useEffect(() => {
    if (settings.status !== LoadingState.READY) {
      return;
    }
    const overrides = settings.value?.shortcuts ?? {};
    if (!hydrated) {
      dispatch(shortcuts.Actions.hydrate({ overrides }));
    } else {
      for (const actionId of changedBindings(lastSettings.current, overrides)) {
        dispatch(overrides[actionId] === undefined
          ? shortcuts.Actions.resetAction({ actionId })
          : shortcuts.Actions.setOverride({ actionId, sequences: overrides[actionId] }));
      }
    }
    lastSettings.current = overrides;
  }, [dispatch, settings.status, settings.value, hydrated]);
}
