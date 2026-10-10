import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Crop, Plus, X } from 'lucide-react';

import { games } from '@cockatrice/datatrice';
import { Button, IconButton } from '@app/components';
import {
  PlaymatFallbackBehavior,
  PlaymatMode,
  PlaymatVisibility,
  getPlaymatSettings,
  setPlaymatSettings,
  usePlaymatSettingsState,
  type PlaymatSettings,
} from '@app/hooks';
import { CardDTO } from '@app/services';
import { PLAYMAT_NAME_MAX_LENGTH } from '@app/types';
import { cx } from '@app/utils';

import { FieldError, SelectBox, focusRing } from '../controls/fields';
import type { CustomControlProps } from '../registry';
import { ArtPreview, CardNameForm, type SubmitResult } from './ArtParts';
import CropEditor from './CropEditor';
import { movePlaymat } from './playmatList';

const TILE = { width: 132, height: 96 };

function usePlaymatSave() {
  const [settings, save] = usePlaymatSettingsState();
  const [saveError, setSaveError] = useState(false);
  const update = (patch: Partial<PlaymatSettings>) => {
    setSaveError(false);
    return save(patch).catch(() => {
      setSaveError(true);
    });
  };
  return { settings, update, saveError, setSaveError };
}

function SaveError({ shown }: { shown: boolean }) {
  const { t } = useTranslation();
  return shown ? <FieldError>{t('PlaymatSettings.validation.saveFailed')}</FieldError> : null;
}

type NumericField = 'visibility' | 'mode' | 'fallbackBehavior';

function playmatSelect(field: NumericField, options: readonly { value: number; labelKey: string }[]) {
  function PlaymatSelect({ id, labelId, describedBy, disabled }: CustomControlProps) {
    const { t } = useTranslation();
    const { settings, update, saveError } = usePlaymatSave();
    return (
      <span className="flex flex-col items-end gap-1">
        <SelectBox
          id={id}
          value={settings[field]}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(e) => void update({ [field]: Number(e.target.value) })}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </SelectBox>
        <SaveError shown={saveError} />
      </span>
    );
  }
  PlaymatSelect.displayName = `PlaymatSelect(${field})`;
  return PlaymatSelect as ComponentType<CustomControlProps>;
}

export const PlaymatVisibilitySelect = playmatSelect('visibility', [
  { value: PlaymatVisibility.ALL, labelKey: 'PlaymatSettings.visibility.all' },
  { value: PlaymatVisibility.OWN_ONLY, labelKey: 'PlaymatSettings.visibility.ownOnly' },
  { value: PlaymatVisibility.NONE, labelKey: 'PlaymatSettings.visibility.none' },
]);

export const PlaymatModeSelect = playmatSelect('mode', [
  { value: PlaymatMode.OVERRIDE_DECK, labelKey: 'PlaymatSettings.mode.overrideDeck' },
  { value: PlaymatMode.FALLBACK, labelKey: 'PlaymatSettings.mode.fallback' },
  { value: PlaymatMode.DECK_ONLY, labelKey: 'PlaymatSettings.mode.deckOnly' },
]);

export const PlaymatListModeSelect = playmatSelect('fallbackBehavior', [
  { value: PlaymatFallbackBehavior.FIXED, labelKey: 'PlaymatSettings.collection.fixed' },
  { value: PlaymatFallbackBehavior.ROUND_ROBIN, labelKey: 'PlaymatSettings.collection.roundRobin' },
  { value: PlaymatFallbackBehavior.RANDOM, labelKey: 'PlaymatSettings.collection.random' },
]);

export function PlaymatCollection({ labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const { settings, update, saveError, setSaveError } = usePlaymatSave();
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const list = settings.fallbackList;
  const editingPlaymat = editing !== null ? list[editing] : undefined;
  const operation = useRef(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const cropButtons = useRef(new Map<number, HTMLButtonElement>());
  const pendingFocus = useRef<'add' | number | null>(null);

  useEffect(() => () => {
    operation.current += 1;
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) {
      return;
    }
    pendingFocus.current = null;
    (target === 'add' ? addButton.current : cropButtons.current.get(target))?.focus();
  });

  const cancelAdd = () => {
    operation.current += 1;
    pendingFocus.current = 'add';
    setAdding(false);
  };
  const closeCrop = () => {
    pendingFocus.current = editing;
    setEditing(null);
  };

  const setList = (next: games.Playmat[]) => update({ fallbackList: next });
  const move = (from: number, to: number) => {
    void setList(movePlaymat(list, from, to));
    setEditing((current) => (current === from ? to : current === to ? from : current));
  };
  const remove = (index: number) => {
    void setList(list.filter((_, i) => i !== index));
    setEditing(null);
  };
  const add = async (cardName: string): Promise<SubmitResult> => {
    const op = ++operation.current;
    const live = () => op === operation.current;
    setSaveError(false);
    let card: CardDTO | undefined;
    try {
      card = await CardDTO.get(cardName);
    } catch {
      return { ok: false, error: live() ? t('PlaymatSettings.validation.lookupFailed') : undefined };
    }
    if (!live()) {
      return { ok: false };
    }
    if (!card?.name?.value || card.name.value.length > PLAYMAT_NAME_MAX_LENGTH) {
      return { ok: false, error: t('PlaymatSettings.validation.unknownCard') };
    }
    const current = getPlaymatSettings().fallbackList;
    try {
      await setPlaymatSettings({
        fallbackList: [...current, { cardName: card.name.value, cardProviderId: '', params: games.DEFAULT_PLAYMAT_PARAMS }],
      });
    } catch {
      setSaveError(true);
      return { ok: false };
    }
    if (live()) {
      pendingFocus.current = current.length;
      setAdding(false);
      setEditing(current.length);
    }
    return { ok: true };
  };

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-stretch gap-gap">
        {list.map((playmat, index) => {
          const name = playmat.cardName;
          return (
            <li key={`${index}-${name}`} className="flex flex-col gap-1" style={{ width: TILE.width }}>
              <ArtPreview playmat={playmat} {...TILE}>
                <span
                  className={cx(
                    'absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full',
                    'bg-bg-base/85 px-1 font-mono text-[10px] text-text-primary',
                  )}
                >
                  {index + 1}
                </span>
              </ArtPreview>
              <span className="flex items-center gap-0.5 text-[11px] text-text-secondary">
                <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
                <IconButton
                  size="sm"
                  className="!h-6 !w-6"
                  label={t('PlaymatSettings.collection.moveEarlier', { card: name })}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronLeft size={13} aria-hidden />
                </IconButton>
                <IconButton
                  size="sm"
                  className="!h-6 !w-6"
                  label={t('PlaymatSettings.collection.moveLater', { card: name })}
                  disabled={disabled || index === list.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronRight size={13} aria-hidden />
                </IconButton>
                <IconButton
                  ref={(element) => {
                    if (element) {
                      cropButtons.current.set(index, element);
                    } else {
                      cropButtons.current.delete(index);
                    }
                  }}
                  size="sm"
                  className="!h-6 !w-6"
                  label={t('PlaymatSettings.collection.editCrop', { card: name })}
                  active={editing === index}
                  disabled={disabled}
                  onClick={() => setEditing(editing === index ? null : index)}
                >
                  <Crop size={13} aria-hidden />
                </IconButton>
                <IconButton
                  size="sm"
                  className="!h-6 !w-6 hover:!text-danger"
                  label={t('PlaymatSettings.collection.removeCard', { card: name })}
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <X size={13} aria-hidden />
                </IconButton>
              </span>
            </li>
          );
        })}
        <li>
          <button
            ref={addButton}
            type="button"
            disabled={disabled}
            aria-expanded={adding}
            onClick={() => (adding ? cancelAdd() : setAdding(true))}
            className={cx(
              'flex flex-col items-center justify-center gap-1 rounded-ui border border-dashed border-border-strong',
              'text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45',
              focusRing,
            )}
            style={TILE}
          >
            <Plus size={16} aria-hidden />
            {t('PlaymatSettings.collection.addArt')}
          </button>
        </li>
      </ol>
      {list.length === 0 && !adding && (
        <p className="text-[12px] text-text-muted">{t('PlaymatSettings.collection.empty')}</p>
      )}
      {adding && (
        <CardNameForm
          label={t('PlaymatSettings.collection.cardName')}
          submitLabel={t('PlaymatSettings.collection.add')}
          maxLength={PLAYMAT_NAME_MAX_LENGTH}
          disabled={disabled}
          onSubmit={add}
          onCancel={cancelAdd}
        />
      )}
      {editingPlaymat && editing !== null && (
        <div className="flex flex-col gap-2 rounded-ui border border-border-subtle bg-bg-sunken p-3">
          <span className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
            {t('PlaymatSettings.collection.cropOf', { card: editingPlaymat.cardName })}
            <Button size="sm" variant="quiet" className="ml-auto" onClick={closeCrop}>
              {t('PlaymatSettings.collection.done')}
            </Button>
          </span>
          <CropEditor
            key={editing}
            playmat={editingPlaymat}
            onChange={(params) => void setList(list.map((entry, i) => (i === editing ? { ...entry, params } : entry)))}
          />
        </div>
      )}
      <SaveError shown={saveError} />
    </div>
  );
}
