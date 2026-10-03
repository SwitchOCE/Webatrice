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
