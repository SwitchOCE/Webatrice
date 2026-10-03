// Startup capability preflight. The supported browsers are declared in
// package.json `browserslist` (the same engines the e2e matrix runs: Chromium,
// Firefox, WebKit); every API below ships in all of them. A missing one means an
// older or embedded browser that still parses the bundle, a feature disabled by
// policy or privacy mode, or a page served outside a secure context (WebCrypto
// and the Clipboard API exist only on https:// and localhost).
//
// Required features gate the boot: without them the client cannot reach a
// server or log in, so index.tsx renders the unsupported-browser screen instead
// of the app. Optional ones each have a fallback in the code that uses them; the
// app boots and FeatureDetection names what is degraded.
//
// IndexedDB is checked separately and asynchronously (dexieService.testConnection):
// the global can exist while opening a database fails, as in some private modes.

export type BrowserFeature =
  | 'webSocket'
  | 'webCrypto'
  | 'textEncoder'
  | 'bigInt'
  | 'structuredClone'
  | 'fetch'
  | 'indexedDB'
  | 'worker'
  | 'broadcastChannel'
  | 'resizeObserver'
  | 'clipboard';

export interface BrowserSupport {
  missingRequired: BrowserFeature[];
  missingOptional: BrowserFeature[];
}

interface FeatureCheck {
  feature: BrowserFeature;
  required: boolean;
  isAvailable: () => boolean;
}

const isFunction = (value: unknown): boolean => typeof value === 'function';

const CHECKS: readonly FeatureCheck[] = [
  // The server connection (Sockatrice WebSocketService).
  { feature: 'webSocket', required: true, isAvailable: () => isFunction(globalThis.WebSocket) },
  // Password hashing (SHA-512 via crypto.subtle) and salts/GUIDs (getRandomValues).
  {
    feature: 'webCrypto',
    required: true,
    isAvailable: () => isFunction(globalThis.crypto?.getRandomValues) && isFunction(globalThis.crypto?.subtle?.digest),
  },
  { feature: 'textEncoder', required: true, isAvailable: () => isFunction(globalThis.TextEncoder) },
  // Protobuf-ES maps int64 fields to BigInt.
  { feature: 'bigInt', required: true, isAvailable: () => isFunction(globalThis.BigInt) },
  // The action slice snapshots dispatched payloads.
  { feature: 'structuredClone', required: true, isAvailable: () => isFunction(globalThis.structuredClone) },
  // Translations, the public server list and card data.
  {
    feature: 'fetch',
    required: true,
    isAvailable: () => isFunction(globalThis.fetch) && isFunction(globalThis.AbortController),
  },
  { feature: 'indexedDB', required: true, isAvailable: () => globalThis.indexedDB != null },

  // Keep-alive falls back to a main-thread timer, which browsers throttle in background tabs.
  { feature: 'worker', required: false, isAvailable: () => isFunction(globalThis.Worker) },
  // The pop-out card preview window.
  { feature: 'broadcastChannel', required: false, isAvailable: () => isFunction(globalThis.BroadcastChannel) },
  // Card scaling and arrows follow the board size.
  { feature: 'resizeObserver', required: false, isAvailable: () => isFunction(globalThis.ResizeObserver) },
  // Copy buttons (deck export, deck hash).
  {
    feature: 'clipboard',
    required: false,
    isAvailable: () => isFunction(globalThis.navigator?.clipboard?.writeText),
  },
];

export function detectBrowserSupport(): BrowserSupport {
  const missing = CHECKS.filter((check) => !check.isAvailable());

  return {
    missingRequired: missing.filter((check) => check.required).map((check) => check.feature),
    missingOptional: missing.filter((check) => !check.required).map((check) => check.feature),
  };
}
