import { CardDataSettingsDTO, SetDTO, SetPreferenceDTO } from '../dexie/DexieDTOs';
import { dexieService } from '../dexie/DexieService';
import type { Set } from '../dexie/types';
import type { SetPreferenceMap } from './setPriority';

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

export function currentCardDataPreferences(): Promise<CardDataPreferences> {
  if (!snapshot) {
    snapshot = loadCardDataPreferences();
    snapshot.catch(() => {
      snapshot = undefined;
    });
  }
  return snapshot;
}

export async function refreshCardDataPreferences(): Promise<CardDataPreferences> {
  const next = await loadCardDataPreferences();
  snapshot = Promise.resolve(next);
  return next;
}
