import { act, renderHook } from '@testing-library/react';
import { SettingDTO } from '@app/services';
import { settingsStore } from './useSettings';
import { DEFAULT_PLAYMAT_SETTINGS, usePlaymatSettings, setPlaymatSettings, parsePlaymatSettings } from './usePlaymatSettings';

beforeEach(async () => {
  await settingsStore.whenReady(); settingsStore.setValue(new SettingDTO('*app'));
});
it('reads and updates the typed settings row for every consumer', async () => {
  const current = settingsStore.peek()!;
  const patch = vi.spyOn(SettingDTO, 'patch').mockImplementation(async (_user, changes) =>
    Object.assign(new SettingDTO('*app'), typeof changes === 'function' ? changes(current) : changes));
  const { result } = renderHook(() => usePlaymatSettings());
  expect(result.current).toEqual(DEFAULT_PLAYMAT_SETTINGS);
  await act(async () => {
    await setPlaymatSettings({ visibility: 0 });
  });
  expect(result.current.visibility).toBe(0);
  expect(settingsStore.peek()!.playmatSettings.visibility).toBe(0);
  expect(patch).toHaveBeenCalledOnce();
});
it('repairs malformed legacy JSON and invalid values', () => {
  expect(parsePlaymatSettings('{bad')).toEqual(DEFAULT_PLAYMAT_SETTINGS);
  expect(parsePlaymatSettings(JSON.stringify({ visibility: 9, fallbackList: [null, { cardName: '' }] })))
    .toEqual(DEFAULT_PLAYMAT_SETTINGS);
});

it('clamps legacy crop values and rejects oversized card names', () => {
  const parsed = parsePlaymatSettings(JSON.stringify({ mode: 'invalid', fallbackList: [
    { cardName: 'Swamp', params: { zoom: 99, marginPctL: -3 } }, { cardName: 'x'.repeat(256) },
  ] }));
  expect(parsed.mode).toBe(DEFAULT_PLAYMAT_SETTINGS.mode);
  expect(parsed.fallbackList).toHaveLength(1);
  expect(parsed.fallbackList[0].params).toEqual({ zoom: 4, marginPctL: 0, marginPctR: 0.07, verticalOffset: 0.33 });
});
