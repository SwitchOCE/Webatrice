// The capability preflight itself is public/preflight.js: a classic script that
// index.html runs before the module entry, so it also reaches browsers that
// cannot parse the bundle. This module only reads the result it publishes.

export type BrowserFeature =
  | 'syntax'
  | 'esModules'
  | 'bigInt'
  | 'webSocket'
  | 'cryptoRandom'
  | 'textEncoder'
  | 'structuredClone'
  | 'fetch'
  | 'indexedDB'
  | 'resizeObserver'
  | 'webCrypto'
  | 'worker'
  | 'broadcastChannel'
  | 'clipboard';

export interface BrowserSupport {
  missingRequired: BrowserFeature[];
  missingOptional: BrowserFeature[];
}

/**
 * The preflight's result. Reports full support when the preflight did not run
 * (e.g. under test, or if a deployment dropped the script), so the app boots as
 * it did before the preflight existed.
 */
export function getBrowserSupport(): BrowserSupport {
  const support = window.Cockatrice?.browserSupport;

  return {
    missingRequired: (support?.missingRequired ?? []) as BrowserFeature[],
    missingOptional: (support?.missingOptional ?? []) as BrowserFeature[],
  };
}
