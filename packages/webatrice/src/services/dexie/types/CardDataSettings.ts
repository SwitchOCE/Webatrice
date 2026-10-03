export class CardDataSettings {
  id: 'singleton';
  /** Ordered picture URL templates (desktop `downloads/urls`). */
  pictureUrlTemplates: string[];
  /** Desktop `updates/alwaysEnableNewSets`. */
  alwaysEnableNewSets: boolean;
  /** ISO timestamp of the last upstream update check. */
  lastUpdateCheck?: string;
}
