import { PREFERENCE_DEFAULTS, SETTINGS_VERSION } from '@app/types';
import { LANGUAGE_STORAGE_KEY } from '@app/utils';
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

    (a.messageMacros as string[]).push('hello');

    expect(b.messageMacros).toEqual([]);
    expect(PREFERENCE_DEFAULTS.messageMacros).toEqual([]);
    expect(Object.isFrozen(PREFERENCE_DEFAULTS.messageMacros)).toBe(true);
  });
});

describe('fillPreferenceDefaults', () => {
  it('fills every preference key', () => {
    const row: Record<string, unknown> = {};
    fillPreferenceDefaults(row);
    expect(Object.keys(row).sort()).toEqual(Object.keys(PREFERENCE_DEFAULTS).sort());
  });

  it('replaces null and wrongly typed values with the default, keeping well-typed ones', () => {
    const row: Record<string, unknown> = { messageMacros: null, masterVolume: '50', soundTheme: 'Legacy', chatMention: 0 };
    fillPreferenceDefaults(row);
    expect(row).toMatchObject({
      messageMacros: [],
      masterVolume: PREFERENCE_DEFAULTS.masterVolume,
      soundTheme: 'Legacy',
      chatMention: PREFERENCE_DEFAULTS.chatMention,
    });
  });
});

describe('v2: language', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('adopts the language i18next cached before the preference existed', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt-BR');
    expect(migrateSetting({ user: '*app', version: 1 }).language).toBe('pt_BR');
  });

  it('follows the browser language when nothing usable was cached', () => {
    expect(migrateSetting({ user: '*app', version: 1 }).language).toBe('');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ja');
    expect(migrateSetting({ user: '*app', version: 1 }).language).toBe('');
  });

  it('leaves a current row alone', () => {
    expect(migrateSetting({ user: '*app', version: 2, language: 'fr' }).language).toBe('fr');
  });
});
