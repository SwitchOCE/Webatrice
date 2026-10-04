import { BROWSER_RESERVED_SEQUENCES } from './browserReserved';
import { allActionIds, defaults } from './defaults';
import i18n from './SettingsTab/ShortcutsTab.i18n.json';
import { normalizeSequence } from './shortcutSequence';
import type { ActionId } from './types';

// deck.new keeps desktop's Ctrl+N here; the deck editor i18n / a11y change
// rebinds it to Ctrl+Alt+N. Drop the entry with that change.
const PENDING_REMAP: readonly ActionId[] = ['deck.new'];

describe('shortcut defaults', () => {
  const boundTo = (sequence: string) =>
    (Object.keys(defaults) as ActionId[]).filter((id) => defaults[id].sequences.includes(sequence));

  // Desktop binds Shift+Tab to aNextPhaseAction and leaves previous phase
  // unbound (shortcuts_settings.h); Webatrice moved the key off game.prevPhase.
  it('binds Shift+Tab to next phase with action only', () => {
    expect(boundTo('Shift+Tab')).toEqual(['game.nextPhaseAction']);
  });

  it('leaves previous phase unbound', () => {
    expect(defaults['game.prevPhase'].sequences).toEqual([]);
  });

  // Keyed by the chord the matcher compares, so Shift+Ctrl+KeyK and
  // Ctrl+Shift+KeyK count as one.
  it('binds no sequence to two actions of one scope', () => {
    const owners = new Map<string, ActionId[]>();
    for (const id of allActionIds) {
      for (const sequence of defaults[id].sequences) {
        const key = `${defaults[id].scope} ${normalizeSequence(sequence)}`;
        owners.set(key, [...(owners.get(key) ?? []), id]);
      }
    }
    expect([...owners].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });

  it('labels every action and group in the Shortcuts tab', () => {
    const labels: Record<string, string> = i18n.ShortcutsTab.action;
    const groups: Record<string, string> = i18n.ShortcutsTab.group;
    expect(allActionIds.filter((id) => !labels[id])).toEqual([]);
    expect([...new Set(allActionIds.map((id) => defaults[id].group))].filter((g) => !groups[g])).toEqual([]);
  });

  // A default on a browser-reserved chord never reaches the page, so it
  // would look bound in the Shortcuts tab and do nothing. Every scope.
  const reservedOwners = (sequence: string) => {
    const reserved = normalizeSequence(sequence);
    return allActionIds.filter((id) => defaults[id].sequences.some((s) => normalizeSequence(s) === reserved));
  };

  it.each(BROWSER_RESERVED_SEQUENCES)('binds no action to the browser-reserved %s', (sequence) => {
    expect(reservedOwners(sequence).filter((id) => !PENDING_REMAP.includes(id))).toEqual([]);
  });

  it('lists only actions still on a reserved chord as pending a remap', () => {
    expect(PENDING_REMAP.filter((id) => !BROWSER_RESERVED_SEQUENCES.some((sequence) => reservedOwners(sequence).includes(id))))
      .toEqual([]);
  });
});
