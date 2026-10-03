import { act, renderHook } from '@testing-library/react';

import {
  BRACKET_LOOKUPS_STORAGE_KEY,
  readBracketLookupsAllowed,
  useBracketLookupsConsent,
  writeBracketLookupsAllowed,
} from './bracketConsent';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('bracket lookups consent', () => {
  it('is off until the user opts in', () => {
    expect(readBracketLookupsAllowed()).toBe(false);
  });

  it('ignores a value it did not write', () => {
    window.localStorage.setItem(BRACKET_LOOKUPS_STORAGE_KEY, 'yes');
    expect(readBracketLookupsAllowed()).toBe(false);
  });

  it('remembers the choice in localStorage', () => {
    writeBracketLookupsAllowed(true);
    expect(window.localStorage.getItem(BRACKET_LOOKUPS_STORAGE_KEY)).toBe('true');
    expect(readBracketLookupsAllowed()).toBe(true);

    writeBracketLookupsAllowed(false);
    expect(readBracketLookupsAllowed()).toBe(false);
  });

  it('keeps the choice for the session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    writeBracketLookupsAllowed(true);
    expect(readBracketLookupsAllowed()).toBe(true);

    vi.restoreAllMocks();
    writeBracketLookupsAllowed(false);
    expect(readBracketLookupsAllowed()).toBe(false);
  });

  it('updates every hook user when one of them changes it', () => {
    const first = renderHook(() => useBracketLookupsConsent());
    const second = renderHook(() => useBracketLookupsConsent());
    expect(second.result.current[0]).toBe(false);

    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    expect(second.result.current[0]).toBe(true);

    act(() => second.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
  });
});
