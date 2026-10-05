import { useState } from 'react';

import {
  readZoneViewPreferences,
  writeZoneViewPreferences,
  type ZoneViewPreferences,
} from './zoneViewPreferences';
import type { GroupMode, SortMode } from './zoneViewSort';

/** A zone view's group / sort / pile choices, read once when it opens and stored as they change. */
export function useZoneViewPreferences(storageKey: string) {
  const [prefs, setPrefs] = useState<ZoneViewPreferences>(() => readZoneViewPreferences(storageKey));
  const updatePreferences = (changes: Partial<ZoneViewPreferences>) => {
    setPrefs((p) => ({ ...p, ...changes }));
    writeZoneViewPreferences(storageKey, changes);
  };

  return {
    ...prefs,
    setGroupBy: (groupBy: GroupMode) => updatePreferences({ groupBy }),
    setSortBy: (sortBy: SortMode) => updatePreferences({ sortBy }),
    setPileView: (pileView: boolean) => updatePreferences({ pileView }),
  };
}
