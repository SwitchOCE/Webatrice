import { useCallback } from 'react';

import { getSettings, settingsStore, usePreference } from '@app/hooks';
import { CommanderSpellbookIntegration } from '@app/types';

/** Whether bracket analysis may run now; `requestedNow` is the user asking (Enabled). */
export function lookupsAllowedFor(mode: CommanderSpellbookIntegration, requestedNow: boolean): boolean {
  return mode === CommanderSpellbookIntegration.Automatic
    || (mode === CommanderSpellbookIntegration.Enabled && requestedNow);
}

/** Store the user's choice on the settings row. */
export async function writeBracketLookupsMode(mode: CommanderSpellbookIntegration): Promise<void> {
  const settings = await getSettings();
  settings.commanderSpellbookIntegration = mode;
  await settings.save();
  settingsStore.setValue(settings);
}

/**
 * Whether, and when, bracket analysis may ask third-party services for
 * data: Scryfall (the Game Changers list and oracle text) and Commander
 * Spellbook (combos). This is desktop's Commander Spellbook integration
 * (Settings › User Interface; deck_editor_settings
 * `commanderspellbookintegrationenabled`):
 *
 * - Unprompted, the default: the bracket section asks on first use;
 * - Disabled: no estimate;
 * - Enabled: an estimate when the user asks for one;
 * - Automatic: an estimate whenever a Commander deck changes.
 *
 * This choice covers bracket analysis, not the editor's other card-data
 * or pricing lookups. Every open deck's bracket section follows it.
 */
export function useBracketLookupsMode(): [CommanderSpellbookIntegration, (mode: CommanderSpellbookIntegration) => void] {
  const mode = usePreference('commanderSpellbookIntegration');
  const setMode = useCallback((next: CommanderSpellbookIntegration) => void writeBracketLookupsMode(next), []);
  return [mode, setMode];
}
