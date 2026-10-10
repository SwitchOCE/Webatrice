import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { useMessageMacros, useSettings } from '@app/hooks';

import type { CustomControlProps } from '../registry';
import { buildMessageMacroSchema, type MessageMacroValues } from './chatSettingsSchemas';

export default function MessageMacrosEditor({ labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const macros = useMessageMacros();
  const [editing, setEditing] = useState<number | null>(null);

  const save = (next: string[]) => {
    void settings.update({ messageMacros: next });
  };

  return (
    <div className="settings-macros" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      {macros.length === 0 ? (
        <p className="settings-macros__empty">{t('SettingsChat.macros.empty')}</p>
      ) : (
        <ol className="settings-macros__list">
          {macros.map((macro, index) => (
            <li key={`${index}:${macro}`} className="settings-macros__item">
              {editing === index ? (
                <MacroForm
                  initial={macro}
                  submitLabel={t('SettingsChat.macros.save')}
                  inputLabel={t('SettingsChat.macros.editLabel', { index: index + 1 })}
                  disabled={disabled}
                  onCancel={() => setEditing(null)}
                  onSubmit={(message) => {
                    save(macros.map((m, i) => (i === index ? message : m)));
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <span className="settings-macros__text">{macro}</span>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={t('SettingsChat.macros.edit', { message: macro })}
                    disabled={disabled}
                    onClick={() => setEditing(index)}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={t('SettingsChat.macros.remove', { message: macro })}
                    disabled={disabled}
                    onClick={() => {
                      setEditing(null);
                      save(macros.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <MacroForm
        submitLabel={t('SettingsChat.macros.add')}
        inputLabel={t('SettingsChat.macros.newLabel')}
        disabled={disabled}
        resetOnSubmit
        onSubmit={(message) => save([...macros, message])}
      />
    </div>
  );
}

interface MacroFormProps {
  initial?: string;
  submitLabel: string;
  inputLabel: string;
  disabled: boolean;
  resetOnSubmit?: boolean;
  onSubmit: (message: string) => void;
  onCancel?: () => void;
}

function MacroForm({ initial = '', submitLabel, inputLabel, disabled, resetOnSubmit, onSubmit, onCancel }: MacroFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => buildMessageMacroSchema(t), [t]);
  const { control, handleSubmit, reset } = useForm<MessageMacroValues>({
    defaultValues: { message: initial },
    resolver: zodResolver(schema),
  });

  const submit = handleSubmit(({ message }) => {
    onSubmit(message);
    if (resetOnSubmit) {
      reset({ message: '' });
    }
  });

  return (
    <form className="settings-macros__form" onSubmit={submit} noValidate>
      <Controller
        name="message"
        control={control}
        render={({ field, fieldState }) => (
          <span className="settings-text">
            <input
              {...field}
              type="text"
              className="settings-input"
              aria-label={inputLabel}
              aria-invalid={fieldState.error ? true : undefined}
              placeholder={t('SettingsChat.macros.placeholder')}
              disabled={disabled}
              autoFocus={initial !== ''}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && onCancel) {
                  e.preventDefault();
                  onCancel();
                }
              }}
            />
            {fieldState.error && (
              <span role="alert" className="settings-text__error">{fieldState.error.message}</span>
            )}
          </span>
        )}
      />
      <button type="submit" className="settings-button" disabled={disabled}>
        {!onCancel && <Plus size={14} aria-hidden />}
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="settings-button settings-button--quiet" onClick={onCancel}>
          {t('SettingsChat.macros.cancel')}
        </button>
      )}
    </form>
  );
}
