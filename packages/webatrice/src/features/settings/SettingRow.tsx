import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadingState, usePreferences, useSettings } from '@app/hooks';
import type { Preferences } from '@app/types';

import type { SettingControl, SettingEntry } from './registry';

interface SettingRowProps {
  entry: SettingEntry;
}

export const settingControlId = (entry: SettingEntry) => `setting-${entry.id}`;

export default function SettingRow({ entry }: SettingRowProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const preferences = usePreferences();
  const ready = settings.status === LoadingState.READY;
  const disabled = !ready || (entry.dependsOn != null && !preferences[entry.dependsOn]);
  const id = settingControlId(entry);
  const descriptionId = entry.descriptionKey ? `${id}-description` : undefined;

  const update = (patch: Partial<Preferences>) => {
    void settings.update(patch);
  };

  const custom = entry.control.kind === 'custom' ? entry.control : null;
  const labelId = `${id}-label`;

  if (entry.visibleWhen && !entry.visibleWhen(preferences)) {
    return null;
  }

  return (
    <div
      className={custom?.layout === 'block' ? 'settings-row settings-row--block' : 'settings-row'}
      data-setting={entry.id}
    >
      <div className="settings-row__text">
        {custom ? (
          <span id={labelId} className="settings-row__label">{t(entry.labelKey)}</span>
        ) : (
          <label id={labelId} htmlFor={id} className="settings-row__label">{t(entry.labelKey)}</label>
        )}
        {entry.descriptionKey && (
          <p id={descriptionId} className="settings-row__description">
            {t(entry.descriptionKey)}
          </p>
        )}
      </div>
      <div className="settings-row__control">
        {custom ? (
          <custom.component id={id} labelId={labelId} describedBy={descriptionId} disabled={disabled} />
        ) : (
          <BuiltInControl
            id={id}
            control={entry.control as Exclude<SettingControl, { kind: 'custom' }>}
            preferences={preferences}
            disabled={disabled}
            describedBy={descriptionId}
            onChange={update}
          />
        )}
      </div>
    </div>
  );
}

interface BuiltInControlProps {
  id: string;
  control: Exclude<SettingControl, { kind: 'custom' }>;
  preferences: Preferences;
  disabled: boolean;
  describedBy?: string;
  onChange: (patch: Partial<Preferences>) => void;
}

function BuiltInControl({ id, control, preferences, disabled, describedBy, onChange }: BuiltInControlProps) {
  const { t } = useTranslation();

  switch (control.kind) {
    case 'toggle':
      return (
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="settings-switch"
          checked={preferences[control.key]}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ [control.key]: e.target.checked })}
        />
      );
    case 'select':
      return (
        <select
          id={id}
          className="settings-input"
          value={preferences[control.key]}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ [control.key]: e.target.value })}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelKey ? t(option.labelKey) : (option.label ?? option.value)}
            </option>
          ))}
        </select>
      );
    case 'range':
      return (
        <RangeControl
          id={id}
          control={control}
          preferences={preferences}
          disabled={disabled}
          describedBy={describedBy}
          onChange={onChange}
        />
      );
    case 'text':
      return (
        <CommittedInput
          id={id}
          type="text"
          className="settings-input"
          value={preferences[control.key]}
          placeholder={control.placeholderKey ? t(control.placeholderKey) : undefined}
          disabled={disabled}
          aria-describedby={describedBy}
          onCommit={(value) => onChange({ [control.key]: value.trim() })}
        />
      );
    case 'number':
      return (
        <NumberControl
          id={id}
          control={control}
          preferences={preferences}
          disabled={disabled}
          describedBy={describedBy}
          onChange={onChange}
        />
      );
    case 'color':
      return (
        <CommittedInput
          id={id}
          type="color"
          className="settings-color"
          value={`#${preferences[control.key]}`}
          disabled={disabled}
          aria-describedby={describedBy}
          onCommit={(value) => onChange({ [control.key]: value.replace(/^#/, '').toUpperCase() })}
        />
      );
  }
}

export
function pushedAlong(
  control: Extract<SettingControl, { kind: 'number' }>,
  value: number,
  preferences: Preferences,
): Partial<Preferences> {
  if (!control.pushes) {
    return {};
  }
  const { key, keep } = control.pushes;
  const other = preferences[key];
  return (keep === 'atLeast' ? other < value : other > value) ? { [key]: value } : {};
}

function clampWhole(raw: string, min: number, max: number): number | undefined {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

type RangeControlProps = Omit<BuiltInControlProps, 'control'> & {
  control: Extract<SettingControl, { kind: 'range' }>;
};

function RangeControl({ id, control, preferences, disabled, describedBy, onChange }: RangeControlProps) {
  const [shown, setShown] = useState<string | null>(null);
  const commit = (raw: string) => {
    setShown(null);
    const patch = { [control.key]: Number(raw) };
    onChange(patch);
    control.onCommit?.({ ...preferences, ...patch });
  };

  return (
    <span className="settings-range">
      <CommittedInput
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step ?? 1}
        value={String(preferences[control.key])}
        disabled={disabled}
        aria-describedby={describedBy}
        onDraft={setShown}
        onCommit={commit}
      />
      <output htmlFor={id} className="settings-range__value">
        {shown ?? preferences[control.key]}
      </output>
    </span>
  );
}

type NumberControlProps = Omit<BuiltInControlProps, 'control'> & {
  control: Extract<SettingControl, { kind: 'number' }>;
};

function NumberControl({ id, control, preferences, disabled, describedBy, onChange }: NumberControlProps) {
  const { t } = useTranslation();
  const { unitKey } = control;
  const unitId = unitKey ? `${id}-unit` : undefined;
  const commit = (raw: string) => {
    const value = clampWhole(raw, control.min, control.max);
    if (value !== undefined) {
      onChange({ [control.key]: value, ...pushedAlong(control, value, preferences) });
    }
  };

  return (
    <span className="settings-number">
      <CommittedInput
        id={id}
        type="number"
        inputMode="numeric"
        className="settings-input settings-number__input"
        min={control.min}
        max={control.max}
        step={1}
        value={String(preferences[control.key])}
        disabled={disabled}
        aria-describedby={[describedBy, unitId].filter(Boolean).join(' ') || undefined}
        onCommit={commit}
      />
      {unitKey && <span id={unitId} className="settings-number__unit">{t(unitKey)}</span>}
    </span>
  );
}

type CommittedInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onDraft?: (value: string) => void;
  onCommit: (value: string) => void;
};

function CommittedInput({ value, onDraft, onCommit, ...props }: CommittedInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const input = ref.current;
    if (!input) {
      return;
    }
    const commit = () => {
      setDraft(null);
      commitRef.current(input.value);
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);

  return (
    <input
      ref={ref}
      {...props}
      value={draft ?? value}
      onChange={(e) => {
        if (e.nativeEvent.type !== 'input') {
          return;
        }
        setDraft(e.target.value);
        onDraft?.(e.target.value);
      }}
    />
  );
}
