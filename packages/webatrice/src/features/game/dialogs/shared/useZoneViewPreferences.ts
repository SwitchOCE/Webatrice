import { useEffect, useState } from 'react';

import {
  readZoneViewPreferences,
  writeZoneViewPreferences,
  type ZoneViewPreferences,
} from './zoneViewPreferences';
import type { GroupMode, SortMode } from './zoneViewSort';

/** A zone view's group / sort / pile choices, read once when it opens and stored as they change. */
export function useZoneViewPreferences(storageKey: string) {
  const [prefs, setPrefs] = useState<ZoneViewPreferences>(() => readZoneViewPreferences(storageKey));
  useEffect(() => {
    writeZoneViewPreferences(storageKey, prefs);
  }, [storageKey, prefs]);

  return {
    ...prefs,
    setGroupBy: (groupBy: GroupMode) => setPrefs((p) => ({ ...p, groupBy })),
    setSortBy: (sortBy: SortMode) => setPrefs((p) => ({ ...p, sortBy })),
    setPileView: (pileView: boolean) => setPrefs((p) => ({ ...p, pileView })),
  };
}
