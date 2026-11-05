import 'fake-indexeddb/auto';
import { APP_USER, PREFERENCE_DEFAULTS, SETTINGS_VERSION, ThemeName } from '@app/types';

vi.unmock('dexie');

import { dexieService } from '../DexieService';
import { SettingDTO } from './SettingDTO';

beforeEach(async () => {
  await dexieService.settings.clear();
});

afterAll(() => {
  dexieService.settings.db.close();
});

describe('SettingDTO', () => {
  it('constructs with the given user, the current schema version and every preference default', () => {
    const setting = new SettingDTO('alice');
    expect(setting.user).toBe('alice');
    expect(setting.version).toBe(SETTINGS_VERSION);
    expect(setting).toMatchObject(PREFERENCE_DEFAULTS);
  });

  it('does not share array defaults between instances', () => {
    const a = new SettingDTO('a');
    (a.messageMacros as string[]).push('gg');
    expect(new SettingDTO('b').messageMacros).toEqual([]);
  });

  it('saves an instance and reads it case-insensitively as a DTO', async () => {
    const setting = new SettingDTO('Alice');
    expect(await setting.save()).toBe('Alice');
    const loaded = await SettingDTO.get('alice');
    expect(loaded).toEqual(setting);
    expect(loaded).toBeInstanceOf(SettingDTO);
  });

  it('patch initializes a first visit with the default theme and current version', async () => {
    const row = await SettingDTO.patch(APP_USER);
    expect(row).toMatchObject({
      user: APP_USER,
      version: SETTINGS_VERSION,
      themeName: PREFERENCE_DEFAULTS.themeName,
    });
    expect(await SettingDTO.get(APP_USER)).toEqual(row);
  });

  it('patch migrates and persists the version and theme for an existing row', async () => {
    await dexieService.settings.put({ user: APP_USER, version: 4, themeName: ThemeName.Graphite });
    const row = await SettingDTO.patch(APP_USER);
    expect(row).toMatchObject({ version: SETTINGS_VERSION, themeName: ThemeName.Midnight });
    expect(await SettingDTO.get(APP_USER)).toEqual(row);
  });

  it('patch preserves a newer schema version', async () => {
    await dexieService.settings.put({ ...new SettingDTO(APP_USER), version: SETTINGS_VERSION + 1 });
    expect((await SettingDTO.patch(APP_USER)).version).toBe(SETTINGS_VERSION + 1);
  });

  it('patch does not resave a current row when there are no changes', async () => {
    const original = await SettingDTO.patch(APP_USER);
    const put = vi.spyOn(dexieService.settings, 'put');
    expect(await SettingDTO.patch(APP_USER)).toEqual(original);
    expect(put).not.toHaveBeenCalled();
  });

  it('patch merges literal and functional changes with the persisted row', async () => {
    await SettingDTO.patch(APP_USER, { soundEnabled: true });
    await SettingDTO.patch(APP_USER, (current) => ({
      autoConnect: current.soundEnabled,
      shortcuts: { ...current.shortcuts, 'game.drawCard': ['F2'] },
    }));
    expect(await SettingDTO.get(APP_USER)).toMatchObject({
      soundEnabled: true, autoConnect: true, shortcuts: { 'game.drawCard': ['F2'] },
    });
  });
});
