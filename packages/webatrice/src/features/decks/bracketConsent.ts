import { useCallback } from 'react';

import { updateSettings, usePreference } from '@app/hooks';
import { CommanderSpellbookIntegration } from '@app/types';

export function lookupsAllowedFor(mode: CommanderSpellbookIntegration, requestedNow: boolean): boolean {
  return mode === CommanderSpellbookIntegration.Automatic
    || (mode === CommanderSpellbookIntegration.Enabled && requestedNow);
}

export async function writeBracketLookupsMode(mode: CommanderSpellbookIntegration): Promise<void> {
  await updateSettings({ commanderSpellbookIntegration: mode });
}

export function useBracketLookupsMode(): [CommanderSpellbookIntegration, (mode: CommanderSpellbookIntegration) => void] {
  const mode = usePreference('commanderSpellbookIntegration');
  const setMode = useCallback((next: CommanderSpellbookIntegration) => void writeBracketLookupsMode(next), []);
  return [mode, setMode];
}
