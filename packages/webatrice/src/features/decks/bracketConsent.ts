import { useCallback } from 'react';

import { getSettings, settingsStore, usePreference } from '@app/hooks';
import { CommanderSpellbookIntegration } from '@app/types';

/** Whether the estimate may look data up now; `requestedNow` is the user asking (Enabled). */
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
 * Whether, and when, the bracket estimate may ask third-party services for
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
 * Nothing goes to a third party before the user picks Enabled or
 * Automatic, so opening a deck sends nothing. This module is the only
 * reader and writer of the choice; every open deck view follows it.
 */
export function useBracketLookupsMode(): [CommanderSpellbookIntegration, (mode: CommanderSpellbookIntegration) => void] {
  const mode = usePreference('commanderSpellbookIntegration');
  const setMode = useCallback((next: CommanderSpellbookIntegration) => void writeBracketLookupsMode(next), []);
  return [mode, setMode];
}
