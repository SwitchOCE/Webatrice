import { allActionIds, defaults } from './defaults';
import i18n from './SettingsTab/ShortcutsTab.i18n.json';
import { ShortcutScope, type ActionId } from './types';

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

  it('binds no sequence to two actions of one scope', () => {
    const owners = new Map<string, ActionId[]>();
    for (const id of allActionIds) {
      for (const sequence of defaults[id].sequences) {
        const key = `${defaults[id].scope} ${sequence}`;
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

  // Keys the browser keeps (reload, fullscreen, devtools, tab and window
  // management): a game default on one of them would never reach the page.
  it.each([
    'F5', 'F11', 'F12', 'Ctrl+KeyT', 'Ctrl+Shift+KeyT', 'Ctrl+KeyW', 'Ctrl+Shift+KeyW', 'Ctrl+KeyN', 'Ctrl+Shift+KeyN',
    'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Alt+F4', 'Ctrl+Digit1', 'Ctrl+Digit9', 'Ctrl+Digit0',
  ])('binds no game action to the browser-reserved %s', (sequence) => {
    expect(boundTo(sequence).filter((id) => defaults[id].scope === ShortcutScope.GAME)).toEqual([]);
  });
});
