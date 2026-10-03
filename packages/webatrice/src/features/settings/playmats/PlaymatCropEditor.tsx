import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from '@mui/material/Slider';

import { ScryfallImageSize, type games } from '@cockatrice/datatrice';
import { getScryfallUrl } from '@app/services';
import { playmatImageBox, type Size } from '@app/utils';

const PREVIEW: Size = { width: 320, height: 120 };

interface PlaymatCropEditorProps {
  playmat: games.Playmat;
  onChange: (params: games.PlaymatParams) => void;
}

/**
 * Crop controls for one collection entry, the numeric editors of desktop's
 * PlaymatSettingsDialog: margins as percentages, vertical offset and zoom,
 * over a preview cropped with the in-game math.
 */
export default function PlaymatCropEditor({ playmat, onChange }: PlaymatCropEditorProps) {
  const { t } = useTranslation();
  const [card, setCard] = useState<Size | null>(null);
  const { params } = playmat;
  const box = card ? playmatImageBox(card, params, PREVIEW) : null;
  const src = getScryfallUrl({ providerId: playmat.cardProviderId, name: playmat.cardName }, ScryfallImageSize.Large);

  const sliders: { key: keyof games.PlaymatParams; label: string; min: number; max: number; step: number; percent?: boolean }[] = [
    { key: 'marginPctL', label: t('PlaymatSettings.crop.leftMargin'), min: 0, max: 0.95, step: 0.01, percent: true },
    { key: 'marginPctR', label: t('PlaymatSettings.crop.rightMargin'), min: 0, max: 0.95, step: 0.01, percent: true },
    { key: 'verticalOffset', label: t('PlaymatSettings.crop.verticalOffset'), min: 0, max: 1, step: 0.01 },
    { key: 'zoom', label: t('PlaymatSettings.crop.zoom'), min: 0.1, max: 4, step: 0.05 },
  ];

  return (
    <div className="playmat-settings__crop" role="group" aria-label={t('PlaymatSettings.crop.title')}>
      <div className="playmat-settings__preview" style={PREVIEW} aria-label={t('PlaymatSettings.crop.preview')} role="img">
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(event) => setCard({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
            style={box
              ? { position: 'absolute', maxWidth: 'none', left: box.x, top: box.y, width: box.width, height: box.height }
              : { visibility: 'hidden' }}
          />
        )}
      </div>
      {sliders.map(({ key, label, min, max, step, percent }) => (
        <label key={key} className="playmat-settings__slider">
          <span>{label}</span>
          <Slider
            size="small"
            min={min}
            max={max}
            step={step}
            value={params[key]}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => (percent ? `${Math.round(value * 100)}` : value.toFixed(2))}
            onChange={(_, value) => onChange({ ...params, [key]: value as number })}
            slotProps={{ input: { 'aria-label': label } }}
          />
        </label>
      ))}
    </div>
  );
}
