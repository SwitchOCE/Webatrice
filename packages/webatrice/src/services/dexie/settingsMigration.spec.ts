import { PREFERENCE_DEFAULTS, SETTINGS_VERSION, ThemeMode } from '@app/types';
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

describe('v2: theme palette and language', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('keeps an existing user on the dark palette they have always had', () => {
    expect(migrateSetting({ user: '*app', version: 1 }).themeMode).toBe(ThemeMode.Dark);
    expect(migrateSetting({ user: '*app' }).themeMode).toBe(ThemeMode.Dark);
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
    const row = migrateSetting({ user: '*app', version: 2, themeMode: ThemeMode.Light, language: 'fr' });
    expect(row.themeMode).toBe(ThemeMode.Light);
    expect(row.language).toBe('fr');
  });

  it('gives a fresh row the desktop default of following the system', () => {
    expect(PREFERENCE_DEFAULTS.themeMode).toBe(ThemeMode.System);
  });
});
