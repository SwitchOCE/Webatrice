import { vi } from 'vitest';

import { detectBrowserSupport, type BrowserFeature } from './browserSupport';

class Stub {}
const stubFn = () => undefined;

// jsdom lacks several of these APIs, so every test starts from a fully
// supported browser and blanks the one under test.
function stubSupportedBrowser(): void {
  vi.stubGlobal('WebSocket', Stub);
  vi.stubGlobal('crypto', { getRandomValues: stubFn, subtle: { digest: stubFn } });
  vi.stubGlobal('TextEncoder', Stub);
  vi.stubGlobal('BigInt', stubFn);
  vi.stubGlobal('structuredClone', stubFn);
  vi.stubGlobal('fetch', stubFn);
  vi.stubGlobal('AbortController', Stub);
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('Worker', Stub);
  vi.stubGlobal('BroadcastChannel', Stub);
  vi.stubGlobal('ResizeObserver', Stub);
  vi.stubGlobal('navigator', { clipboard: { writeText: stubFn } });
}

describe('detectBrowserSupport', () => {
  beforeEach(() => {
    stubSupportedBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports nothing missing in a supported browser', () => {
    expect(detectBrowserSupport()).toEqual({ missingRequired: [], missingOptional: [] });
  });

  it.each<[string, BrowserFeature]>([
    ['WebSocket', 'webSocket'],
    ['TextEncoder', 'textEncoder'],
    ['BigInt', 'bigInt'],
    ['structuredClone', 'structuredClone'],
    ['fetch', 'fetch'],
    ['AbortController', 'fetch'],
    ['indexedDB', 'indexedDB'],
  ])('requires %s', (global, feature) => {
    vi.stubGlobal(global, undefined);

    expect(detectBrowserSupport()).toEqual({ missingRequired: [feature], missingOptional: [] });
  });

  it('requires WebCrypto, which is absent outside a secure context', () => {
    vi.stubGlobal('crypto', { getRandomValues: stubFn });

    expect(detectBrowserSupport().missingRequired).toEqual(['webCrypto']);
  });

  it('requires crypto itself', () => {
    vi.stubGlobal('crypto', undefined);

    expect(detectBrowserSupport().missingRequired).toEqual(['webCrypto']);
  });

  it.each<[string, BrowserFeature]>([
    ['Worker', 'worker'],
    ['BroadcastChannel', 'broadcastChannel'],
    ['ResizeObserver', 'resizeObserver'],
  ])('degrades without %s', (global, feature) => {
    vi.stubGlobal(global, undefined);

    expect(detectBrowserSupport()).toEqual({ missingRequired: [], missingOptional: [feature] });
  });

  it('degrades without the Clipboard API', () => {
    vi.stubGlobal('navigator', {});

    expect(detectBrowserSupport()).toEqual({ missingRequired: [], missingOptional: ['clipboard'] });
  });

  it('lists every missing feature in declaration order', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('WebSocket', undefined);
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('fetch', undefined);

    expect(detectBrowserSupport()).toEqual({
      missingRequired: ['webSocket', 'fetch'],
      missingOptional: ['worker', 'resizeObserver'],
    });
  });
});
