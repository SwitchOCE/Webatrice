import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import { usePreference, useSettings } from '@app/hooks';

import type { CustomControlProps } from '../registry';
import { buildHighlightWordsSchema, type HighlightWordsValues } from './chatSettingsSchemas';

/**
 * Custom alert words (desktop "Custom alert words"). Saved as typed, like desktop's line edit,
 * but only while the text is valid; an invalid edit shows why and is not persisted.
 */
export default function HighlightWordsField({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const stored = usePreference('chatHighlightWords');
  const schema = useMemo(() => buildHighlightWordsSchema(t), [t]);

  const { control, getValues, reset } = useForm<HighlightWordsValues>({
    defaultValues: { words: stored },
    resolver: zodResolver(schema),
    mode: 'onChange',
  });

  // Follow outside changes (settings loading, "Restore defaults") without clobbering an edit.
  useEffect(() => {
    if (getValues('words') !== stored) {
      reset({ words: stored });
    }
  }, [stored, getValues, reset]);

  const errorId = `${id}-error`;

  return (
    <Controller
      name="words"
      control={control}
      render={({ field, fieldState }) => (
        <span className="settings-text">
          <input
            {...field}
            id={id}
            type="text"
            className="settings-input"
            placeholder={t('SettingsChat.highlightWords.placeholder')}
            aria-labelledby={labelId}
            aria-describedby={[describedBy, fieldState.error ? errorId : null].filter(Boolean).join(' ') || undefined}
            aria-invalid={fieldState.error ? true : undefined}
            disabled={disabled}
            onChange={(e) => {
              field.onChange(e);
              // Persist from the native onChange only, never from a form watcher, so a reset
              // from outside can't echo back into Dexie.
              const value = e.target.value;
              if (schema.safeParse({ words: value }).success) {
                void settings.update({ chatHighlightWords: value });
              }
            }}
          />
          {fieldState.error && (
            <span id={errorId} role="alert" className="settings-text__error">
              {fieldState.error.message}
            </span>
          )}
        </span>
      )}
    />
  );
}
