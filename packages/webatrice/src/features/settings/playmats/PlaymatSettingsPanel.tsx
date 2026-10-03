import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import { games } from '@cockatrice/datatrice';
import { SelectField } from '@app/components';
import {
  PlaymatFallbackBehavior,
  PlaymatMode,
  PlaymatVisibility,
  usePlaymatSettingsState,
} from '@app/hooks';

import PlaymatCropEditor from './PlaymatCropEditor';

import './PlaymatSettingsPanel.css';

const buildAddSchema = (t: TFunction) =>
  z.object({ cardName: z.string().trim().min(1, t('Common.validation.required')) });

type AddFormValues = z.infer<ReturnType<typeof buildAddSchema>>;

/**
 * Desktop's "Playmat settings" group (AppearanceSettingsPage) with its
 * "Default Playmats" collection dialog inlined: visibility, how the collection
 * combines with a deck's own playmat, the list mode, and the ordered
 * collection with a crop editor per entry. Every change is saved at once.
 */
export default function PlaymatSettingsPanel() {
  const { t } = useTranslation();
  const [settings, update] = usePlaymatSettingsState();
  const [editing, setEditing] = useState<number | null>(null);
  const list = settings.fallbackList;

  const resolver = useMemo(() => zodResolver(buildAddSchema(t)), [t]);
  const { control, handleSubmit, reset } = useForm<AddFormValues>({ defaultValues: { cardName: '' }, resolver });

  const setList = (next: games.Playmat[]) => update({ fallbackList: next });
  const move = (from: number, to: number) => {
    const next = [...list];
    [next[from], next[to]] = [next[to], next[from]];
    setList(next);
    setEditing((current) => (current === from ? to : current === to ? from : current));
  };
  const add = ({ cardName }: AddFormValues) => {
    setList([...list, { cardName: cardName.trim(), cardProviderId: '', params: games.DEFAULT_PLAYMAT_PARAMS }]);
    setEditing(list.length);
    reset();
  };
  const remove = (index: number) => {
    setList(list.filter((_, i) => i !== index));
    setEditing(null);
  };

  return (
    <section className="playmat-settings" aria-labelledby="playmat-settings-title">
      <h2 id="playmat-settings-title" className="playmat-settings__title">{t('PlaymatSettings.title')}</h2>
      <p className="playmat-settings__note">{t('PlaymatSettings.serverNote')}</p>

      <SelectField
        label={t('PlaymatSettings.visibility.label')}
        value={settings.visibility}
        onChange={(e) => update({ visibility: Number(e.target.value) as PlaymatVisibility })}
        options={[
          { value: PlaymatVisibility.ALL, label: t('PlaymatSettings.visibility.all') },
          { value: PlaymatVisibility.OWN_ONLY, label: t('PlaymatSettings.visibility.ownOnly') },
          { value: PlaymatVisibility.NONE, label: t('PlaymatSettings.visibility.none') },
        ]}
      />
      <SelectField
        label={t('PlaymatSettings.mode.label')}
        value={settings.mode}
        onChange={(e) => update({ mode: Number(e.target.value) as PlaymatMode })}
        options={[
          { value: PlaymatMode.OVERRIDE_DECK, label: t('PlaymatSettings.mode.overrideDeck') },
          { value: PlaymatMode.FALLBACK, label: t('PlaymatSettings.mode.fallback') },
          { value: PlaymatMode.DECK_ONLY, label: t('PlaymatSettings.mode.deckOnly') },
        ]}
      />

      <h3 className="playmat-settings__subtitle">{t('PlaymatSettings.collection.title')}</h3>
      <SelectField
        label={t('PlaymatSettings.collection.listMode')}
        value={settings.fallbackBehavior}
        onChange={(e) => update({ fallbackBehavior: Number(e.target.value) as PlaymatFallbackBehavior })}
        options={[
          { value: PlaymatFallbackBehavior.FIXED, label: t('PlaymatSettings.collection.fixed') },
          { value: PlaymatFallbackBehavior.ROUND_ROBIN, label: t('PlaymatSettings.collection.roundRobin') },
          { value: PlaymatFallbackBehavior.RANDOM, label: t('PlaymatSettings.collection.random') },
        ]}
      />

      {list.length === 0
        ? <p className="playmat-settings__empty">{t('PlaymatSettings.collection.empty')}</p>
        : (
          <ol className="playmat-settings__list">
            {list.map((playmat, index) => (
              <li key={`${index}-${playmat.cardName}`} className="playmat-settings__entry">
                <div className="playmat-settings__entry-row">
                  <span className="playmat-settings__entry-name">{playmat.cardName}</span>
                  <Button size="small" onClick={() => setEditing(editing === index ? null : index)}>
                    {editing === index ? t('PlaymatSettings.collection.done') : t('PlaymatSettings.collection.edit')}
                  </Button>
                  <Button size="small" onClick={() => remove(index)}>{t('PlaymatSettings.collection.remove')}</Button>
                  <Button size="small" disabled={index === 0} onClick={() => move(index, index - 1)}>
                    {t('PlaymatSettings.collection.moveUp')}
                  </Button>
                  <Button size="small" disabled={index === list.length - 1} onClick={() => move(index, index + 1)}>
                    {t('PlaymatSettings.collection.moveDown')}
                  </Button>
                </div>
                {editing === index && (
                  <PlaymatCropEditor
                    playmat={playmat}
                    onChange={(params) => setList(list.map((entry, i) => (i === index ? { ...entry, params } : entry)))}
                  />
                )}
              </li>
            ))}
          </ol>
        )}

      <form className="playmat-settings__add" onSubmit={handleSubmit(add)} noValidate>
        <Controller
          name="cardName"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              size="small"
              label={t('PlaymatSettings.collection.cardName')}
              placeholder={t('PlaymatSettings.collection.cardNamePlaceholder')}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            />
          )}
        />
        <Button type="submit" variant="outlined">{t('PlaymatSettings.collection.add')}</Button>
      </form>
    </section>
  );
}
