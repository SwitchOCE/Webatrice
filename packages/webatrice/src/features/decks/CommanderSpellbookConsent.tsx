import { useTranslation } from 'react-i18next';

import { DialogShell } from '@app/dialogs';
import { CommanderSpellbookIntegration } from '@app/types';

const BUTTON_CLASS = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors';

export interface CommanderSpellbookConsentProps {
  /** The mode chosen, or null when the prompt is dismissed (it asks again next time). */
  onChoose: (mode: CommanderSpellbookIntegration | null) => void;
}

/**
 * Desktop's first-use prompt (commander_bracket_widget.cpp `promptCommanderSpellbookIntegration`):
 * the bracket estimate sends the deck list to Commander Spellbook, so ask before anything is sent.
 * Desktop's bracket-naming choice is left out: Webatrice's estimate already reports the official
 * bracket numbers and names.
 */
function CommanderSpellbookConsent({ onChoose }: CommanderSpellbookConsentProps) {
  const { t } = useTranslation();

  return (
    <DialogShell isOpen handleClose={() => onChoose(null)} title={t('CommanderSpellbookConsent.title')}>
      <p className="whitespace-pre-line">{t('CommanderSpellbookConsent.message')}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onChoose(CommanderSpellbookIntegration.Disabled)}
          className={`${BUTTON_CLASS} hover:bg-bg-elevated`}
        >
          {t('CommanderSpellbookConsent.disable')}
        </button>
        <button
          type="button"
          onClick={() => onChoose(CommanderSpellbookIntegration.Automatic)}
          className={`${BUTTON_CLASS} hover:bg-bg-elevated`}
        >
          {t('CommanderSpellbookConsent.automatic')}
        </button>
        <button
          type="button"
          onClick={() => onChoose(CommanderSpellbookIntegration.Enabled)}
          className={`${BUTTON_CLASS} bg-accent text-white hover:bg-accent-hover`}
        >
          {t('CommanderSpellbookConsent.enable')}
        </button>
      </div>
    </DialogShell>
  );
}

export default CommanderSpellbookConsent;
