import { act, renderHook } from '@testing-library/react';

import { LoadingState } from '@app/hooks';
import { makeSettings, makeSettingsHook } from '../../../hooks/__mocks__/useSettings';

vi.mock('../../../hooks/useSettings');

import { useSettings } from '../../../hooks/useSettings';
import { LOGIN_ART_CARDS } from './loginArt';
import { forgetLoginArt, useLoginArt } from './useLoginArt';

beforeEach(() => {
  forgetLoginArt();
  vi.mocked(useSettings).mockReturnValue(makeSettingsHook());
});

describe('useLoginArt', () => {
  test('starts on a curated card with its art crop URL', () => {
    const { result } = renderHook(() => useLoginArt(() => 0));
    expect(result.current.name).toBe(LOGIN_ART_CARDS[0]);
    expect(result.current.url).toContain('version=art_crop');
    expect(result.current.failed).toBe(false);
  });

  test('falls back after an image error and recovers on shuffle', () => {
    const { result } = renderHook(() => useLoginArt(() => 0));
    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);

    act(() => result.current.shuffle());
    expect(result.current.failed).toBe(false);
    expect(result.current.name).not.toBe(LOGIN_ART_CARDS[0]);
  });

  test('keeps the same art when the login page remounts during the visit', () => {
    const first = renderHook(() => useLoginArt(() => 0.5));
    act(() => first.result.current.shuffle());
    const shown = first.result.current.name;
    first.unmount();

    const second = renderHook(() => useLoginArt(() => 0));
    expect(second.result.current.name).toBe(shown);
  });

  test('requests no art while the preference is off', () => {
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook({ value: makeSettings({ signInCardArt: false }) }));
    const { result } = renderHook(() => useLoginArt(() => 0));
    expect(result.current.enabled).toBe(false);
    expect(result.current.url).toBeNull();
  });

  test('requests no art until the preferences have loaded', () => {
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook({ status: LoadingState.LOADING, value: undefined }));
    const { result } = renderHook(() => useLoginArt(() => 0));
    expect(result.current.url).toBeNull();
  });

  test('drops the URL after an image error', () => {
    const { result } = renderHook(() => useLoginArt(() => 0));
    act(() => result.current.onError());
    expect(result.current.url).toBeNull();
  });
});
