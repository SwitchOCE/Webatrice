import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from '@mui/material/Slider';

import { type games } from '@cockatrice/datatrice';
import { PlaymatImage } from '@app/components';
import { type Size } from '@app/utils';

const PREVIEW: Size = { width: 320, height: 120 };

const asPercent = (value: number) => `${Math.round(value * 100)}`;
const asDecimal = (value: number) => value.toFixed(2);

interface PlaymatCropEditorProps {
  playmat: games.Playmat;
  /** Called once per edit, when a slider is released, not on every tick of a drag. */
  onChange: (params: games.PlaymatParams) => void;
}

/**
 * Crop controls for one collection entry: sliders for the values desktop's
 * PlaymatSettingsDialog edits in spin boxes (margins as percentages, vertical
 * offset and zoom), over a preview cropped with the in-game math.
 */
export default function PlaymatCropEditor({ playmat, onChange }: PlaymatCropEditorProps) {
  const { t } = useTranslation();
  // The values being dragged; the preview follows them, the collection is saved on release.
  const [draft, setDraft] = useState<games.PlaymatParams | null>(null);
  const params = draft ?? playmat.params;

  const sliders: {
    key: keyof games.PlaymatParams;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
  }[] = [
    { key: 'marginPctL', label: t('PlaymatSettings.crop.leftMargin'), min: 0, max: 0.95, step: 0.01, format: asPercent },
    { key: 'marginPctR', label: t('PlaymatSettings.crop.rightMargin'), min: 0, max: 0.95, step: 0.01, format: asPercent },
    { key: 'verticalOffset', label: t('PlaymatSettings.crop.verticalOffset'), min: 0, max: 1, step: 0.01, format: asDecimal },
    { key: 'zoom', label: t('PlaymatSettings.crop.zoom'), min: 0.1, max: 4, step: 0.05, format: asDecimal },
  ];

  return (
    <div className="playmat-settings__crop" role="group" aria-label={t('PlaymatSettings.crop.title')}>
      <div className="playmat-settings__preview" style={PREVIEW} aria-label={t('PlaymatSettings.crop.preview')} role="img">
        <PlaymatImage playmat={{ ...playmat, params }} area={PREVIEW} />
      </div>
      {sliders.map(({ key, label, min, max, step, format }) => (
        <label key={key} className="playmat-settings__slider">
          <span>{label}</span>
          <Slider
            size="small"
            min={min}
            max={max}
            step={step}
            value={params[key]}
            valueLabelDisplay="auto"
            valueLabelFormat={format}
            getAriaValueText={format}
            onChange={(_, value) => setDraft({ ...params, [key]: value as number })}
            onChangeCommitted={(_, value) => {
              setDraft(null);
              onChange({ ...params, [key]: value as number });
            }}
            slotProps={{ input: { 'aria-label': label } }}
          />
        </label>
      ))}
    </div>
  );
}
