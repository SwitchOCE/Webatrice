import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

import { usePreferences } from '@app/hooks';
import { soundEngine } from '@app/services';

import type { CustomControlProps } from '../registry';

/** Desktop's "Test system sound engine": plays the player-join sound at the current settings. */
export default function SoundTestButton({ id, labelId, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const { soundEnabled, soundTheme, masterVolume } = usePreferences();

  return (
    <button
      id={id}
      type="button"
      className="settings-button"
      aria-labelledby={labelId}
      disabled={disabled || !soundEnabled}
      onClick={() => soundEngine.test({ enabled: soundEnabled, theme: soundTheme, volume: masterVolume })}
    >
      <Play size={14} aria-hidden />
      {t('SettingsSound.test.button')}
    </button>
  );
}
