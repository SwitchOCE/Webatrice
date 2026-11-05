import { DEFAULT_PICTURE_URL_TEMPLATES } from '../../cardDatabase/pictureUrlTemplates';
import { CardDataSettings } from '../types/CardDataSettings';
import { dexieService } from '../DexieService';

export class CardDataSettingsDTO extends CardDataSettings {
  constructor(settings?: Partial<CardDataSettings>) {
    super();
    this.id = 'singleton';
    this.cardOverrides = { ...settings?.cardOverrides };
    this.pictureUrlTemplates = settings?.pictureUrlTemplates ?? [...DEFAULT_PICTURE_URL_TEMPLATES];
    this.alwaysEnableNewSets = settings?.alwaysEnableNewSets ?? false;
    this.lastUpdateCheck = settings?.lastUpdateCheck;
  }

  save() {
    return dexieService.cardDataSettings.put(this);
  }

  static async get(): Promise<CardDataSettingsDTO> {
    const stored: CardDataSettings | undefined = await dexieService.cardDataSettings.get('singleton');
    return new CardDataSettingsDTO(stored ?? undefined);
  }

  static patch(
    patch: Partial<CardDataSettings> | ((current: CardDataSettingsDTO) => Partial<CardDataSettings>),
  ): Promise<CardDataSettingsDTO> {
    return dexieService.readWrite([dexieService.cardDataSettings], async () => {
      const current = await CardDataSettingsDTO.get();
      Object.assign(current, typeof patch === 'function' ? patch(current) : patch);
      await dexieService.cardDataSettings.put(current);
      return current;
    });
  }

  static async setCardOverride(name: string, providerId: string | undefined): Promise<void> {
    await CardDataSettingsDTO.patch((settings) => {
      if (providerId) {
        settings.cardOverrides[name] = providerId;
      } else {
        delete settings.cardOverrides[name];
      }
      return { cardOverrides: settings.cardOverrides };
    });
  }
}
