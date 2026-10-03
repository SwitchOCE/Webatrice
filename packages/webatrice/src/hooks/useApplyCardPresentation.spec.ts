import { act, renderHook } from '@testing-library/react';

import { useApplyCardPresentation } from './useApplyCardPresentation';
import { getSettings, settingsStore } from './useSettings';

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('useApplyCardPresentation', () => {
  afterEach(() => {
    settingsStore.reset();
    document.documentElement.removeAttribute('style');
  });

  it('applies desktop\'s card rendering defaults to the document', () => {
    renderHook(() => useApplyCardPresentation());
    expect(rootVar('--card-corner-radius')).toBe('7.5%');
    expect(rootVar('--card-hover-scale')).toBe('1.1');
    expect(rootVar('--card-info-font-size')).toBe('calc(var(--card-width, 72px) * 12 / 72)');
  });

  it('follows the options as they change', async () => {
    const settings = await getSettings();
    renderHook(() => useApplyCardPresentation());
    await act(async () => {
      settingsStore.setValue(Object.assign(settings, { roundCardCorners: false, scaleCards: false, maxFontSizeForCards: 20 }));
    });
    expect(rootVar('--card-corner-radius')).toBe('0px');
    expect(rootVar('--card-hover-scale')).toBe('1');
    expect(rootVar('--card-info-font-size')).toBe('calc(var(--card-width, 72px) * 20 / 72)');
  });
});
