import { PREFERENCE_DEFAULTS, SETTINGS_VERSION, Setting } from '@app/types';
import { dexieService } from '../DexieService';
import { migrateSetting } from '../settingsMigration';

export type SettingsPatch = Partial<Setting> | ((current: SettingDTO) => Partial<Setting>);

export class SettingDTO extends Setting {
  constructor(user: string) {
    super();

    this.user = user;
    this.version = SETTINGS_VERSION;
    Object.assign(this, structuredClone(PREFERENCE_DEFAULTS));
  }

  save() {
    return dexieService.settings.put(this);
  }

  static patch(user: string, patch: SettingsPatch = {}): Promise<SettingDTO> {
    return dexieService.readWrite([dexieService.settings], async () => {
      const stored = await SettingDTO.get(user);
      const current = stored ?? new SettingDTO(user);
      const version = stored?.version;
      if (!stored) {
        current.version = 2;
      }
      migrateSetting(current);
      if (!stored) {
        current.themeName = PREFERENCE_DEFAULTS.themeName;
      }
      const changes = typeof patch === 'function' ? patch(current) : patch;
      Object.assign(current, changes);
      if (!stored || version !== current.version || Object.keys(changes).length > 0) {
        await dexieService.settings.put(current);
      }
      return current;
    });
  }

  static get(user: string) {
    return dexieService.settings.where('user').equalsIgnoreCase(user).first();
  }
}

dexieService.settings.mapToClass(SettingDTO);
