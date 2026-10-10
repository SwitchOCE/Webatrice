import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from '@mui/material/Slider';

import { type games } from '@cockatrice/datatrice';
import PlaymatImage from '../PlaymatImage/PlaymatImage';
import { type Size } from '@app/utils';

const PREVIEW: Size = { width: 320, height: 120 };

const asPercent = (value: number) => `${Math.round(value * 100)}`;
const asDecimal = (value: number) => value.toFixed(2);

interface PlaymatCropEditorProps {
  playmat: games.Playmat;
  onChange: (params: games.PlaymatParams) => void;
}

export default function PlaymatCropEditor({ playmat, onChange }: PlaymatCropEditorProps) {
  const { t } = useTranslation();
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
    <div className="flex flex-col gap-1 py-2 pl-4" role="group" aria-label={t('PlaymatSettings.crop.title')}>
      <div className="relative overflow-hidden rounded bg-bg-base" style={PREVIEW}
        aria-label={t('PlaymatSettings.crop.preview')} role="img">
        <PlaymatImage playmat={{ ...playmat, params }} area={PREVIEW} />
      </div>
      {sliders.map(({ key, label, min, max, step, format }) => (
        <label key={key} className="grid grid-cols-[160px_1fr] items-center gap-3 max-w-[480px]">
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
