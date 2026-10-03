import { CardDataSettingsDTO, SetDTO, SetPreferenceDTO } from '../dexie/DexieDTOs';
import { dexieService } from '../dexie/DexieService';
import type { Set } from '../dexie/types';
import type { SetPreferenceMap } from './setPriority';

/** Everything the image resolver and card lookup need to honour the user's card-data choices. */
export interface CardDataPreferences {
  setPreferences: SetPreferenceMap;
  setLongNames: ReadonlyMap<string, string>;
  pictureUrlTemplates: readonly string[];
}

export async function loadCardDataPreferences(): Promise<CardDataPreferences> {
  const [preferences, sets, settings] = await Promise.all([
    SetPreferenceDTO.getAll(),
    dexieService.sets.toArray() as Promise<SetDTO[]>,
    CardDataSettingsDTO.get(),
  ]);
  return {
    setPreferences: new Map(preferences.map((p) => [p.code, p])),
    setLongNames: new Map(
      sets
        .filter((s: Set) => s.name?.value && s.longname?.value)
        .map((s: Set) => [s.name.value, s.longname!.value]),
    ),
    pictureUrlTemplates: settings.pictureUrlTemplates,
  };
}

let snapshot: Promise<CardDataPreferences> | undefined;

/**
 * Process-wide snapshot of the preferences for one-off async readers such as
 * the card catalog. Loaded once and replaced only by `refreshCardDataPreferences`,
 * so readers can compare snapshots by identity to drop caches built under old ones.
 */
export function currentCardDataPreferences(): Promise<CardDataPreferences> {
  if (!snapshot) {
    snapshot = loadCardDataPreferences();
    // A failed load is retried on the next read rather than cached.
    snapshot.catch(() => {
      snapshot = undefined;
    });
  }
  return snapshot;
}

/** Reload the snapshot after the card-database dialogs save new choices. */
export async function refreshCardDataPreferences(): Promise<CardDataPreferences> {
  const next = await loadCardDataPreferences();
  snapshot = Promise.resolve(next);
  return next;
}
