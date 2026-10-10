import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';

import { ConfirmDialog } from '@app/dialogs';
import { LoadingState, useSettings } from '@app/hooks';
import { PREFERENCE_DEFAULTS, type PreferenceKey, type Preferences } from '@app/types';

import { preferenceKeysOf, type SettingsGroup, type SettingsSection } from './registry';
import SettingRow from './SettingRow';

interface SettingsSectionViewProps {
  section: SettingsSection;
}

export default function SettingsSectionView({ section }: SettingsSectionViewProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [confirming, setConfirming] = useState(false);

  if (section.component) {
    const Page = section.component;
    return <Page />;
  }

  const keys = preferenceKeysOf(section);
  const restoreDefaults = () => {
    const patch = Object.fromEntries(
      keys.map((key: PreferenceKey) => [key, structuredClone(PREFERENCE_DEFAULTS[key])]),
    ) as Partial<Preferences>;
    void settings.update(patch);
    setConfirming(false);
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h1 className="settings-section__title">{t(section.titleKey)}</h1>
        {keys.length > 0 && (
          <button
            type="button"
            className="settings-button"
            onClick={() => setConfirming(true)}
            disabled={settings.status !== LoadingState.READY}
          >
            <RotateCcw size={14} aria-hidden />
            {t('Settings.restoreDefaults')}
          </button>
        )}
      </div>
      {section.groups?.map((group) => <SettingsGroupBox key={group.id} group={group} />)}
      <ConfirmDialog
        isOpen={confirming}
        title={t('Settings.restoreDefaultsConfirm.title', { section: t(section.titleKey) })}
        message={t('Settings.restoreDefaultsConfirm.message')}
        confirmLabel={t('Settings.restoreDefaults')}
        cancelLabel={t('Settings.restoreDefaultsConfirm.cancel')}
        destructive
        onConfirm={restoreDefaults}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

interface SettingsGroupBoxProps {
  group: SettingsGroup;
  entries?: SettingsGroup['entries'];
  caption?: string;
}

export function SettingsGroupBox({ group, entries = group.entries, caption }: SettingsGroupBoxProps) {
  const { t } = useTranslation();
  const titleId = `settings-group-${group.id}`;
  return (
    <section className="settings-group" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-group__title">
        {t(group.titleKey)}
        {caption && <span className="settings-group__caption">{caption}</span>}
      </h2>
      <div className="settings-group__rows">
        {entries.map((entry) => <SettingRow key={entry.id} entry={entry} />)}
      </div>
    </section>
  );
}
