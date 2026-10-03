import { PREFERENCE_DEFAULTS, SETTINGS_VERSION } from '@app/types';
import { fillPreferenceDefaults, migrateSetting } from './settingsMigration';

describe('migrateSetting', () => {
  it('upgrades a pre-versioning row, keeping its stored values and shortcut overrides', () => {
    const row = {
      user: '*app',
      autoConnect: true,
      invertVerticalCoordinate: true,
      shortcuts: { 'game.drawCard': ['Ctrl+KeyD'] },
    };

    const migrated = migrateSetting(row);

    expect(migrated.version).toBe(SETTINGS_VERSION);
    expect(migrated.autoConnect).toBe(true);
    expect(migrated.invertVerticalCoordinate).toBe(true);
    expect(migrated.shortcuts).toEqual({ 'game.drawCard': ['Ctrl+KeyD'] });
    expect(migrated.playToStack).toBe(PREFERENCE_DEFAULTS.playToStack);
    expect(migrated.soundEnabled).toBe(false);
    expect(migrated.masterVolume).toBe(100);
    expect(migrated.chatMentionColor).toBe('A6120D');
  });

  it('mutates the row in place, as Dexie Collection.modify expects', () => {
    const row = { user: '*app' };
    expect(migrateSetting(row)).toBe(row);
  });

  it('is idempotent and never overwrites a value the user changed', () => {
    const row = migrateSetting({ user: '*app', playToStack: false, messageMacros: ['gg'] });
    const again = migrateSetting(row);

    expect(again.playToStack).toBe(false);
    expect(again.messageMacros).toEqual(['gg']);
    expect(again.version).toBe(SETTINGS_VERSION);
  });

  it('does not downgrade a row written by a newer schema', () => {
    const row = migrateSetting({ user: '*app', version: SETTINGS_VERSION + 3 });
    expect(row.version).toBe(SETTINGS_VERSION + 3);
  });

  it('gives each row its own copy of array defaults', () => {
    const a = migrateSetting({ user: 'a' });
    const b = migrateSetting({ user: 'b' });

    a.messageMacros.push('hello');

    expect(b.messageMacros).toEqual([]);
    expect(PREFERENCE_DEFAULTS.messageMacros).toEqual([]);
  });
});

describe('fillPreferenceDefaults', () => {
  it('fills every preference key', () => {
    const row: Record<string, unknown> = {};
    fillPreferenceDefaults(row);
    expect(Object.keys(row).sort()).toEqual(Object.keys(PREFERENCE_DEFAULTS).sort());
  });
});
