import { ServerCapability, parseServerVersion, serverSupports } from './server.capabilities';

describe('parseServerVersion', () => {
  it.each([
    ['3.0.0 (2026-05-08)', [3, 0, 0]],
    ['3.1.0-beta.15 (2026-09-27)', [3, 1, 0]],
    ['3.1.0 ()', [3, 1, 0]],
    ['  2.10.3', [2, 10, 3]],
  ])('parses %j', (input, expected) => {
    expect(parseServerVersion(input)).toEqual(expected);
  });

  it.each([null, undefined, '', 'unknown', 'v3.1.0', '3.1'])('returns null for %j', (input) => {
    expect(parseServerVersion(input)).toBeNull();
  });
});

describe('serverSupports', () => {
  const capabilities = Object.values(ServerCapability);

  it.each(capabilities)('%s is unavailable on a 3.0.0 server', (capability) => {
    expect(serverSupports('3.0.0 (2026-05-08)', capability)).toBe(false);
  });

  it.each(capabilities)('%s is available on a 3.1 beta server', (capability) => {
    expect(serverSupports('3.1.0-beta.15 (2026-09-27)', capability)).toBe(true);
  });

  it('treats later releases as supporting 3.1 capabilities', () => {
    expect(serverSupports('3.2.0 (2027-01-01)', ServerCapability.REPORTS)).toBe(true);
    expect(serverSupports('4.0.0', ServerCapability.DECK_SHARING)).toBe(true);
    expect(serverSupports('3.1.1', ServerCapability.PLAYMATS)).toBe(true);
  });

  it('treats older releases as not supporting them', () => {
    expect(serverSupports('2.99.99', ServerCapability.REPORTS)).toBe(false);
  });

  it('answers false for an unknown version', () => {
    expect(serverSupports(null, ServerCapability.REPORTS)).toBe(false);
    expect(serverSupports('custom-build', ServerCapability.REPORTS)).toBe(false);
  });
});
