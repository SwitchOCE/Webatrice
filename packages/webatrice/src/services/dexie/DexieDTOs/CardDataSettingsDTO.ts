import { DEFAULT_PICTURE_URL_TEMPLATES } from '../../cardDatabase/pictureUrlTemplates';
import { CardDataSettings } from '../types/CardDataSettings';
import { dexieService } from '../DexieService';

export class CardDataSettingsDTO extends CardDataSettings {
  constructor(settings?: Partial<CardDataSettings>) {
    super();
    this.id = 'singleton';
    this.pictureUrlTemplates = settings?.pictureUrlTemplates ?? [...DEFAULT_PICTURE_URL_TEMPLATES];
    this.alwaysEnableNewSets = settings?.alwaysEnableNewSets ?? false;
    this.lastUpdateCheck = settings?.lastUpdateCheck;
  }

  save() {
    return dexieService.cardDataSettings.put(this);
  }

  /** The stored settings, or desktop's defaults when none were saved yet. */
  static async get(): Promise<CardDataSettingsDTO> {
    const stored: CardDataSettings | undefined = await dexieService.cardDataSettings.get('singleton');
    return new CardDataSettingsDTO(stored ?? undefined);
  }
}
