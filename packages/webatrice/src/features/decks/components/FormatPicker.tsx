import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MTG_FORMAT_LABELS, MTG_FORMATS, normalizeFormat } from '@app/types';

import { SELECT_CHEVRON_BACKGROUND } from '../selectChevron';

/**
 * Format dropdown plus a custom-value text field, used by the create and
 * import dialogs and, compactly, by the editor sidebar.
 *   - The MTG options gate MTG features in the editor.
 *   - "Other" reveals a text input so non-MTG decks (Netrunner,
 *     playtesting, …) can be labelled; they are stored the same way,
 *     just without MTG-specific UI.
 *   - A value outside the MTG list (an imported `<format>pauper</format>`
 *     variant, say) opens in Other mode with the text prefilled.
 */
export interface FormatPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** `dialog` for the create/import dialogs, `sidebar` for the editor rail. */
  variant: 'dialog' | 'sidebar';
}

const VARIANTS = {
  dialog: {
    root: 'space-y-2',
    select: [
      'w-full appearance-none bg-bg-base border border-border-subtle',
      'rounded-md pl-3 pr-8 py-2 text-sm text-text-primary',
      'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
    ].join(' '),
    chevronPosition: 'right 10px center',
    input: [
      'w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2',
      'text-sm text-text-primary placeholder:text-text-muted',
      'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
    ].join(' '),
    autoFocus: true,
  },
  sidebar: {
    root: 'mt-1 space-y-1.5',
    select: [
      'w-full appearance-none bg-bg-base border border-border-subtle rounded-md pl-2 pr-7',
      'py-1 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors',
    ].join(' '),
    chevronPosition: 'right 6px center',
    input: 'w-full bg-bg-base border border-border-subtle rounded-md px-2 py-1 text-xs '
      + 'text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent '
      + 'transition-colors',
    autoFocus: false,
  },
} as const;

export function FormatPicker({ value, onChange, variant }: FormatPickerProps) {
  const { t } = useTranslation();
  const styles = VARIANTS[variant];
  const normalized = normalizeFormat(value);
  const isKnown = MTG_FORMATS.includes(normalized);

  // "User explicitly picked Other". An empty value alone is ambiguous —
  // a fresh picker defaulting to Commander, or Other picked with nothing
  // typed yet — so the flag persists independently of `value`, seeded
  // from it so an existing custom format opens in Other mode.
  const [otherMode, setOtherMode] = useState(() => !isKnown && normalized !== '');

  const inOtherMode = otherMode || (!isKnown && normalized !== '');
  const dropdownValue = inOtherMode ? 'other' : (isKnown ? normalized : 'commander');

  return (
    <div className={styles.root}>
      <select
        aria-label={t('FormatPicker.label')}
        value={dropdownValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'other') {
            setOtherMode(true);
            onChange('');
          } else {
            setOtherMode(false);
            onChange(next);
          }
        }}
        className={styles.select}
        style={{
          backgroundImage: SELECT_CHEVRON_BACKGROUND,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: styles.chevronPosition,
        }}
      >
        {MTG_FORMAT_LABELS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value="other">{t(`FormatPicker.other.${variant}`)}</option>
      </select>
      {inOtherMode && (
        <input
          type="text"
          value={isKnown ? '' : value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            // Typing a canonical slug snaps the dropdown back to it.
            if (MTG_FORMATS.includes(normalizeFormat(next))) {
              setOtherMode(false);
            }
          }}
          placeholder={t(`FormatPicker.placeholder.${variant}`)}
          maxLength={60}
          className={styles.input}
          autoFocus={styles.autoFocus}
        />
      )}
    </div>
  );
}
