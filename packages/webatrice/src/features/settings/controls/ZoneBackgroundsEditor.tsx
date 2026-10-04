import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import { games } from '@cockatrice/datatrice';
import { usePreference, useSettings } from '@app/hooks';
import type { ZoneBackground, ZoneBackgroundZone } from '@app/types';

import PlaymatCropEditor from '../playmats/PlaymatCropEditor';
import type { CustomControlProps } from '../registry';

import '../playmats/PlaymatSettingsPanel.css';

/** The zones in desktop's theme order (ThemeManager: hand, stack, table, player). */
const ZONES: readonly ZoneBackgroundZone[] = ['hand', 'stack', 'table', 'playerInfo'];

const buildSchema = (t: TFunction) =>
  z.object({ cardName: z.string().trim().min(1, t('Common.validation.required')) });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface ZoneRowProps {
  zone: ZoneBackgroundZone;
  background: ZoneBackground | undefined;
  disabled: boolean;
  onChange: (background: ZoneBackground | undefined) => void;
}

function ZoneRow({ zone, background, disabled, onChange }: ZoneRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const resolver = useMemo(() => zodResolver(buildSchema(t)), [t]);
  const { control, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { cardName: '' }, resolver });
  const zoneLabel = t(`SettingsAppearance.zoneBackgrounds.zone.${zone}`);

  const set = ({ cardName }: FormValues) => {
    onChange({ cardName: cardName.trim(), cardProviderId: '', params: games.DEFAULT_PLAYMAT_PARAMS });
    reset();
  };

  return (
    <li className="playmat-settings__entry" data-zone-background={zone}>
      <div className="playmat-settings__entry-row">
        <span className="playmat-settings__entry-name">
          {t('SettingsAppearance.zoneBackgrounds.current', {
            zone: zoneLabel,
            card: background ? background.cardName : t('SettingsAppearance.zoneBackgrounds.none'),
          })}
        </span>
        {background && (
          <>
            <Button size="small" disabled={disabled} onClick={() => setEditing(!editing)}>
              {editing ? t('PlaymatSettings.collection.done') : t('PlaymatSettings.collection.edit')}
            </Button>
            <Button
              size="small"
              disabled={disabled}
              onClick={() => {
                onChange(undefined);
                setEditing(false);
              }}
            >
              {t('SettingsAppearance.zoneBackgrounds.clear')}
            </Button>
          </>
        )}
      </div>
      {background && editing && (
        <PlaymatCropEditor playmat={background} onChange={(params) => onChange({ ...background, params })} />
      )}
      <form className="playmat-settings__add" onSubmit={handleSubmit(set)} noValidate>
        <Controller
          name="cardName"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              size="small"
              disabled={disabled}
              label={t('SettingsAppearance.zoneBackgrounds.cardName', { zone: zoneLabel })}
              placeholder={t('PlaymatSettings.collection.cardNamePlaceholder')}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            />
          )}
        />
        <Button type="submit" variant="outlined" disabled={disabled}>
          {t('SettingsAppearance.zoneBackgrounds.set')}
        </Button>
      </form>
    </li>
  );
}

/**
 * Backgrounds for the board's hand, stack, table and player area. Desktop takes them from the
 * theme's images; here each is a card's art, cropped with the playmat crop editor. Every change
 * is saved at once.
 */
export default function ZoneBackgroundsEditor({ labelId, disabled }: CustomControlProps) {
  const settings = useSettings();
  const backgrounds = usePreference('zoneBackgrounds') ?? {};

  const setZone = (zone: ZoneBackgroundZone, background: ZoneBackground | undefined) => {
    const next = { ...backgrounds };
    if (background) {
      next[zone] = background;
    } else {
      delete next[zone];
    }
    void settings.update({ zoneBackgrounds: next });
  };

  return (
    <ul className="playmat-settings__list" aria-labelledby={labelId}>
      {ZONES.map((zone) => (
        <ZoneRow
          key={zone}
          zone={zone}
          background={backgrounds[zone]}
          disabled={disabled}
          onChange={(background) => setZone(zone, background)}
        />
      ))}
    </ul>
  );
}
