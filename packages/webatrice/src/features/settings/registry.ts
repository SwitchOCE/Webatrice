import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

import type {
  BooleanPreferenceKey,
  NumberPreferenceKey,
  PreferenceKey,
  Preferences,
  StringPreferenceKey,
} from '@app/types';

/**
 * The Settings page's sections, in desktop's page order (dlg_settings.cpp). A section only appears
 * once something registers content for it, so ids for pages still to come can sit here unused.
 */
export enum SettingsSectionId {
  General = 'general',
  Appearance = 'appearance',
  UserInterface = 'userInterface',
  CardSources = 'cardSources',
  Storage = 'storage',
  Chat = 'chat',
  Sound = 'sound',
  Shortcuts = 'shortcuts',
}

export const SECTION_ORDER: readonly SettingsSectionId[] = [
  SettingsSectionId.General,
  SettingsSectionId.Appearance,
  SettingsSectionId.UserInterface,
  SettingsSectionId.CardSources,
  SettingsSectionId.Storage,
  SettingsSectionId.Chat,
  SettingsSectionId.Sound,
  SettingsSectionId.Shortcuts,
];

export interface SelectOption {
  value: string;
  /** Translation key for the option, or `label` for a literal (e.g. a sound theme's name). */
  labelKey?: string;
  label?: string;
}

/** How one setting is edited. Built-in kinds bind straight to a preference key. */
export type SettingControl =
  | { kind: 'toggle'; key: BooleanPreferenceKey }
  | { kind: 'select'; key: StringPreferenceKey; options: readonly SelectOption[] }
  | {
    kind: 'range';
    key: NumberPreferenceKey;
    min: number;
    max: number;
    step?: number;
    /** Runs once the user lets go, with the preferences as saved. */
    onCommit?: (preferences: Preferences) => void;
  }
  /** A whole number typed or stepped in, like desktop's spin boxes; saved once it is committed. */
  | {
    kind: 'number';
    key: NumberPreferenceKey;
    min: number;
    max: number;
    /** Translation key for a unit shown after the box (desktop's spin-box suffix). */
    suffixKey?: string;
  }
  | { kind: 'color'; key: StringPreferenceKey }
  /**
   * Anything else. `keys` lists the preferences it edits so "Restore defaults" covers them;
   * `layout: 'block'` puts a wide control (a list editor) under its label instead of beside it.
   */
  | {
    kind: 'custom';
    component: ComponentType<CustomControlProps>;
    keys?: readonly PreferenceKey[];
    layout?: 'inline' | 'block';
  };

/** What the Settings page hands a custom control so it can label itself like a built-in. */
export interface CustomControlProps {
  id: string;
  labelId: string;
  describedBy?: string;
  /** Settings not loaded yet, or the entry's `dependsOn` preference is off. */
  disabled: boolean;
}

export interface SettingEntry {
  /** Unique within the page; used for element ids and search results. */
  id: string;
  labelKey: string;
  descriptionKey?: string;
  control: SettingControl;
  /** Disabled (but still shown) while this preference is off, e.g. volume while sound is off. */
  dependsOn?: BooleanPreferenceKey;
}

/** A desktop group box: a titled run of related settings. */
export interface SettingsGroup {
  id: string;
  titleKey: string;
  entries: readonly SettingEntry[];
}

/**
 * One page of the Settings dialog. Either `groups` of registered settings, or a self-contained
 * `component` (e.g. Shortcuts) that only takes part in search by its title.
 */
export interface SettingsSection {
  id: SettingsSectionId;
  titleKey: string;
  icon: LucideIcon;
  groups?: readonly SettingsGroup[];
  component?: ComponentType;
}

/** Every preference a section edits — what its "Restore defaults" button resets. */
export function preferenceKeysOf(section: SettingsSection): PreferenceKey[] {
  const keys = new Set<PreferenceKey>();
  for (const group of section.groups ?? []) {
    for (const { control } of group.entries) {
      if (control.kind === 'custom') {
        control.keys?.forEach((key) => keys.add(key));
      } else {
        keys.add(control.key);
      }
    }
  }
  return [...keys];
}

/**
 * Merges section registrations into page order. Several modules may contribute to one section
 * (e.g. Appearance); their groups are concatenated in registration order.
 */
export function buildSettingsSections(registrations: readonly SettingsSection[]): SettingsSection[] {
  const byId = new Map<SettingsSectionId, SettingsSection>();
  for (const registration of registrations) {
    const existing = byId.get(registration.id);
    if (!existing) {
      byId.set(registration.id, { ...registration });
      continue;
    }
    if (existing.component || registration.component) {
      throw new Error(`Settings section "${registration.id}" is a custom page and cannot be shared`);
    }
    existing.groups = [...(existing.groups ?? []), ...(registration.groups ?? [])];
  }
  return SECTION_ORDER.flatMap((id) => {
    const section = byId.get(id);
    return section && (section.component || section.groups?.length) ? [section] : [];
  });
}
