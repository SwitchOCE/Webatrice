import { act, renderHook } from '@testing-library/react';

const STORAGE_KEY = 'webatrice.playmatSettings';

// The settings are a module-level singleton read from localStorage at import
// time, so each test loads a fresh copy of the module.
async function loadModule() {
  vi.resetModules();
  return import('./usePlaymatSettings');
}

const island = {
  cardName: 'Island',
  cardProviderId: 'uuid-1',
  params: { marginPctL: 0.1, marginPctR: 0.1, verticalOffset: 0.5, zoom: 2 },
};

describe('usePlaymatSettings', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses desktop\'s defaults when nothing is persisted', async () => {
    const { usePlaymatSettings, DEFAULT_PLAYMAT_SETTINGS } = await loadModule();

    const { result } = renderHook(() => usePlaymatSettings());

    expect(result.current).toEqual(DEFAULT_PLAYMAT_SETTINGS);
    expect(DEFAULT_PLAYMAT_SETTINGS).toEqual({ visibility: 2, mode: 1, fallbackBehavior: 0, fallbackList: [] });
  });

  it('persists a change and notifies every consumer', async () => {
    const { usePlaymatSettings, usePlaymatSettingsState, PlaymatVisibility } = await loadModule();
    const reader = renderHook(() => usePlaymatSettings());
    const writer = renderHook(() => usePlaymatSettingsState());

    act(() => writer.result.current[1]({ visibility: PlaymatVisibility.OWN_ONLY, fallbackList: [island] }));

    expect(reader.result.current).toMatchObject({ visibility: PlaymatVisibility.OWN_ONLY, fallbackList: [island] });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ visibility: 1, fallbackList: [island] });
  });

  it('restores persisted settings on load', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visibility: 0, mode: 2, fallbackBehavior: 1, fallbackList: [island] }));
    const { getPlaymatSettings } = await loadModule();

    expect(getPlaymatSettings()).toEqual({ visibility: 0, mode: 2, fallbackBehavior: 1, fallbackList: [island] });
  });
});

describe('parsePlaymatSettings', () => {
  it('falls back to the defaults for malformed JSON', async () => {
    const { parsePlaymatSettings, DEFAULT_PLAYMAT_SETTINGS } = await loadModule();
    expect(parsePlaymatSettings('{not json')).toEqual(DEFAULT_PLAYMAT_SETTINGS);
  });

  it('replaces unknown enum values and drops entries without a card name', async () => {
    const { parsePlaymatSettings } = await loadModule();
    const parsed = parsePlaymatSettings(JSON.stringify({
      visibility: 7,
      mode: 'x',
      fallbackBehavior: 2,
      fallbackList: [{ cardName: '' }, null, { cardName: 'Swamp', params: { zoom: 99 } }],
    }));
    expect(parsed).toEqual({
      visibility: 2,
      mode: 1,
      fallbackBehavior: 2,
      fallbackList: [{
        cardName: 'Swamp',
        cardProviderId: '',
        params: { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 4 },
      }],
    });
  });
});
