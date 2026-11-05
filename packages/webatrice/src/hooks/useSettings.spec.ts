import 'fake-indexeddb/auto';
import { renderHook, act, waitFor } from '@testing-library/react';
import { APP_USER, PREFERENCE_DEFAULTS } from '@app/types';

vi.unmock('dexie');

import { SettingDTO } from '../services/dexie/DexieDTOs/SettingDTO';
import { dexieService } from '../services/dexie/DexieService';
import { getPreferencesSnapshot, getSettings, settingsStore, useMessageMacros, usePreference, useSettings } from './useSettings';
import { LoadingState } from './useSharedStore';

beforeEach(async () => {
  settingsStore.reset();
  await dexieService.settings.clear();
});

afterEach(() => settingsStore.reset());
afterAll(() => dexieService.settings.db.close());

it('starts loading, then resolves to the stored setting', async () => {
  await new SettingDTO(APP_USER).save();
  await SettingDTO.patch(APP_USER, { autoConnect: true });
  const { result } = renderHook(() => useSettings());
  expect(result.current.status).toBe(LoadingState.LOADING);
  await waitFor(() => expect(result.current.value?.autoConnect).toBe(true));
});

it('update persists the patch and renders a new snapshot', async () => {
  await getSettings();
  const { result } = renderHook(() => useSettings());
  const before = result.current;
  await act(async () => {
    await result.current.update({ autoConnect: true });
  });
  expect(result.current).not.toBe(before);
  expect(result.current.value?.autoConnect).toBe(true);
  expect((await SettingDTO.get(APP_USER)).autoConnect).toBe(true);
});

it('returns defaults until loaded, then stored preferences', async () => {
  await SettingDTO.patch(APP_USER, { playToStack: false, messageMacros: ['gg'] });
  const { result } = renderHook(() => ({
    playToStack: usePreference('playToStack'), macros: useMessageMacros(),
  }));
  expect(result.current).toEqual({ playToStack: PREFERENCE_DEFAULTS.playToStack, macros: [] });
  await waitFor(() => expect(result.current).toEqual({ playToStack: false, macros: ['gg'] }));
});

it('usePreference renders only when its preference changes', async () => {
  await getSettings();
  let renders = 0;
  renderHook(() => {
    renders++;
    return usePreference('playToStack');
  });
  const settled = renders;
  const { result } = renderHook(() => useSettings());
  await act(async () => {
    await result.current.update({ soundEnabled: true });
  });
  expect(renders).toBe(settled);
  await act(async () => {
    await result.current.update({ playToStack: false });
  });
  expect(renders).toBe(settled + 1);
});

it('getPreferencesSnapshot returns defaults before load and the row afterwards', async () => {
  expect(getPreferencesSnapshot().soundEnabled).toBe(PREFERENCE_DEFAULTS.soundEnabled);
  await SettingDTO.patch(APP_USER, { soundEnabled: true });
  await getSettings();
  expect(getPreferencesSnapshot().soundEnabled).toBe(true);
});

it('warns when the live settings query fails', async () => {
  await getSettings();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = new Error('settings refresh failed');
  vi.spyOn(SettingDTO, 'get').mockRejectedValueOnce(error);
  await dexieService.settings.put({ ...new SettingDTO(APP_USER), soundEnabled: true });
  await waitFor(() => expect(warning).toHaveBeenCalledWith('Failed to refresh settings', error));
});
