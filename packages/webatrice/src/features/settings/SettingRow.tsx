import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadingState, usePreferences, useSettings } from '@app/hooks';
import type { Preferences } from '@app/types';

import type { SettingControl, SettingEntry } from './registry';

interface SettingRowProps {
  entry: SettingEntry;
}

export const settingControlId = (entry: SettingEntry) => `setting-${entry.id}`;

/** One setting: its label and description beside the control that edits it. */
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
        {/* Custom controls label themselves with aria-labelledby; built-ins take a <label for>. */}
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
      // Stored as desktop does: six hex digits without the '#'.
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

/** Desktop's spin box: a whole number kept within its range, saved once the user commits it. */
function NumberControl({ id, control, preferences, disabled, describedBy, onChange }: NumberControlProps) {
  const { t } = useTranslation();
  const { unitKey } = control;
  const unitId = unitKey ? `${id}-unit` : undefined;
  const commit = (raw: string) => {
    const value = Number(raw);
    // An emptied or invalid field goes back to the saved value, as a spin box cannot be emptied.
    if (raw.trim() === '' || !Number.isFinite(value)) {
      return;
    }
    onChange({ [control.key]: Math.min(control.max, Math.max(control.min, Math.round(value))) });
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
  /** Each value the user passes through while dragging. */
  onDraft?: (value: string) => void;
  /** The value the user settled on. */
  onCommit: (value: string) => void;
};

/**
 * A range, text, number or colour input that saves once the user lets go. The native `change`
 * event fires on release, on a keyboard step, when typed text is committed (Enter or leaving the
 * field) and when the colour picker closes; React's onChange fires on every drag tick or
 * keystroke, and saving each one would write the settings row and re-render its readers.
 */
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
        // React's onChange fires for `input` and `change` alike; the commit above owns `change`,
        // so taking it as a draft too would keep the uncommitted text (an out-of-range number,
        // untrimmed room name) on screen after the saved value came back.
        if (e.nativeEvent.type !== 'input') {
          return;
        }
        setDraft(e.target.value);
        onDraft?.(e.target.value);
      }}
    />
  );
}
