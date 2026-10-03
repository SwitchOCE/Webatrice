import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference, useSettings } from '@app/hooks';

import type { CustomControlProps } from '../registry';

/**
 * Custom alert words (desktop "Custom alert words"). Saved as typed, like desktop's line edit
 * (messages_settings_page.cpp), which has no validator: "alphanumeric characters only" is advice.
 */
export default function HighlightWordsField({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const stored = usePreference('chatHighlightWords');
  const [words, setWords] = useState(stored);

  // Follow outside changes (settings loading, "Restore defaults"). Our own saves come back equal.
  useEffect(() => {
    setWords(stored);
  }, [stored]);

  return (
    <input
      id={id}
      type="text"
      className="settings-input"
      value={words}
      placeholder={t('SettingsChat.highlightWords.placeholder')}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => {
        setWords(e.target.value);
        void settings.update({ chatHighlightWords: e.target.value });
      }}
    />
  );
}
