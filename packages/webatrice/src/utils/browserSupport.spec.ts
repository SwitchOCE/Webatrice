import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import browserFeatureI18n from '../features/shell/BrowserFeature.i18n.json';
import unsupportedI18n from '../features/shell/Unsupported.i18n.json';
import { getBrowserSupport, type BrowserFeature } from './browserSupport';

// public/preflight.js runs as a classic script before the bundle, so it is
// tested as one: evaluated against a stand-in `window` whose globals each test
// controls, rendering into jsdom's document.
const PREFLIGHT = readFileSync(resolve(__dirname, '../../public/preflight.js'), 'utf8');
const TOKENS_CSS = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');

class Stub {}
const stubFn = () => undefined;

type FakeWindow = Record<string, unknown> & { Cockatrice?: { browserSupport?: unknown } };

// A fully supported browser; each test blanks what it is about.
function supportedBrowser(overrides: Record<string, unknown> = {}): FakeWindow {
  return {
    document: { ...documentWithModules(), getElementById: (id: string) => document.getElementById(id) },
    Function,
    SyntaxError,
    BigInt: stubFn,
    WebSocket: Stub,
    crypto: { getRandomValues: stubFn, subtle: { digest: stubFn } },
    TextEncoder: Stub,
    structuredClone: stubFn,
    fetch: stubFn,
    AbortController: Stub,
    indexedDB: {},
    ResizeObserver: Stub,
    Worker: Stub,
    BroadcastChannel: Stub,
    navigator: { language: 'en-US', clipboard: { writeText: stubFn } },
    localStorage: { getItem: () => null },
    ...overrides,
  };
}

// jsdom's script elements lack `noModule`; a module-capable browser has it.
function documentWithModules(hasModules = true) {
  return {
    head: document.head,
    body: document.body,
    documentElement: document.documentElement,
    currentScript: null,
    createElement: (tag: string) => {
      const node = document.createElement(tag);
      if (tag === 'script' && hasModules) {
        Object.defineProperty(node, 'noModule', { value: false });
      }
      return node;
    },
  };
}

function runPreflight(win: FakeWindow) {
  new Function('window', PREFLIGHT)(win);
  return win.Cockatrice?.browserSupport as { missingRequired: BrowserFeature[]; missingOptional: BrowserFeature[] };
}

describe('public/preflight.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"><p>app</p></div>';
  });

  afterEach(() => {
    document.head.querySelectorAll('style').forEach((style) => style.remove());
  });

  it('reports full support and leaves the page alone in a supported browser', () => {
    expect(runPreflight(supportedBrowser())).toEqual({ missingRequired: [], missingOptional: [] });
    expect(document.getElementById('root')!.innerHTML).toBe('<p>app</p>');
  });

  it('keeps window.Cockatrice set by env.js', () => {
    const win = supportedBrowser({ Cockatrice: { env: { RR_GA_KEY: 'G-1' } } });
    runPreflight(win);
    expect(win.Cockatrice).toMatchObject({ env: { RR_GA_KEY: 'G-1' } });
  });

  it.each<[BrowserFeature, Record<string, unknown>]>([
    ['bigInt', { BigInt: undefined }],
    ['webSocket', { WebSocket: undefined }],
    ['cryptoRandom', { crypto: { subtle: { digest: stubFn } } }],
    ['textEncoder', { TextEncoder: undefined }],
    ['structuredClone', { structuredClone: undefined }],
    ['fetch', { fetch: undefined }],
    ['fetch', { AbortController: undefined }],
    ['indexedDB', { indexedDB: undefined }],
    ['resizeObserver', { ResizeObserver: undefined }],
  ])('requires %s', (feature, overrides) => {
    expect(runPreflight(supportedBrowser(overrides))).toEqual({ missingRequired: [feature], missingOptional: [] });
  });

  it('requires ES module support (the `nomodule` property)', () => {
    const win = supportedBrowser();
    win.document = { ...documentWithModules(false), getElementById: (id: string) => document.getElementById(id) };
    expect(runPreflight(win).missingRequired).toEqual(['esModules']);
  });

  it('requires the syntax the bundle is built for', () => {
    // An engine that cannot parse ES2022 throws a SyntaxError from the probe.
    const OldFunction = function OldFunction() {
      throw new SyntaxError('Unexpected token');
    };
    expect(runPreflight(supportedBrowser({ Function: OldFunction })).missingRequired).toEqual(['syntax']);
  });

  it('parses the syntax probe in this engine', () => {
    expect(runPreflight(supportedBrowser({ Function })).missingRequired).toEqual([]);
  });

  it('does not count a CSP that forbids eval as missing syntax', () => {
    const NoEval = function NoEval() {
      throw new EvalError('unsafe-eval');
    };
    expect(runPreflight(supportedBrowser({ Function: NoEval })).missingRequired).toEqual([]);
  });

  it.each<[BrowserFeature, Record<string, unknown>]>([
    // Plain http:// on a LAN: no crypto.subtle, but the client still works.
    ['webCrypto', { crypto: { getRandomValues: stubFn } }],
    ['worker', { Worker: undefined }],
    ['broadcastChannel', { BroadcastChannel: undefined }],
    ['clipboard', { navigator: { language: 'en-US' } }],
  ])('treats %s as optional', (feature, overrides) => {
    expect(runPreflight(supportedBrowser(overrides))).toEqual({ missingRequired: [], missingOptional: [feature] });
    expect(document.getElementById('root')!.innerHTML).toBe('<p>app</p>');
  });

  it('counts a feature whose host getter throws as missing', () => {
    const win = supportedBrowser();
    Object.defineProperty(win, 'indexedDB', {
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(runPreflight(win).missingRequired).toEqual(['indexedDB']);
  });

  describe('unsupported screen', () => {
    it('replaces the app root with a main landmark naming what is missing', () => {
      runPreflight(supportedBrowser({ WebSocket: undefined, ResizeObserver: undefined }));

      const root = document.getElementById('root')!;
      expect(root.children).toHaveLength(1);
      const main = root.querySelector('main.Unsupported')!;
      expect(main.querySelector('h1')!.textContent).toBe(unsupportedI18n.Unsupported.title);
      expect(main.textContent).toContain(unsupportedI18n.Unsupported.missing);
      expect([...main.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
        browserFeatureI18n.BrowserFeature.webSocket,
        browserFeatureI18n.BrowserFeature.resizeObserver,
      ]);
    });

    it('lists only required features, not optional ones', () => {
      runPreflight(supportedBrowser({ WebSocket: undefined, Worker: undefined }));
      expect(document.querySelectorAll('#root li')).toHaveLength(1);
    });

    it('carries the app theme tokens with their tokens.css values', () => {
      runPreflight(supportedBrowser({ WebSocket: undefined }));

      const main = document.querySelector<HTMLElement>('main.Unsupported')!;
      const tokens = [...main.style].filter((name) => name.startsWith('--'));
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        const declared = new RegExp(`${token}:\\s*([^;]+);`).exec(TOKENS_CSS);
        expect(declared?.[1].trim(), token).toBe(main.style.getPropertyValue(token));
      }
      expect(document.head.querySelector('style')!.textContent).toContain('rgb(var(--bg-base))');
    });

    it('swaps in the user\'s language when its translation loads', () => {
      const requests: { url: string; respond: (status: number, body: string) => void }[] = [];
      class FakeXhr {
        status = 0;
        responseText = '';
        onload: () => void = stubFn;
        onerror: () => void = stubFn;
        private url = '';
        open(_method: string, url: string) {
          this.url = url;
        }
        send() {
          requests.push({
            url: this.url,
            respond: (status, body) => {
              this.status = status;
              this.responseText = body;
              this.onload();
            },
          });
        }
      }

      runPreflight(supportedBrowser({
        WebSocket: undefined,
        XMLHttpRequest: FakeXhr,
        navigator: { language: 'pt-BR' },
      }));

      expect(document.querySelector('h1')!.textContent).toBe(unsupportedI18n.Unsupported.title);
      expect(requests.map((request) => request.url)).toEqual(['/locales/pt_BR/translation.json']);

      requests[0].respond(404, '');
      expect(requests[1].url).toBe('/locales/pt/translation.json');

      requests[1].respond(200, JSON.stringify({ Unsupported: { title: 'Navegador não suportado' } }));
      expect(document.querySelector('h1')!.textContent).toBe('Navegador não suportado');
      // Keys the translation lacks stay English.
      expect(document.querySelector('li')!.textContent).toBe(browserFeatureI18n.BrowserFeature.webSocket);
      expect(document.documentElement.lang).toBe('pt');
      document.documentElement.lang = 'en';
    });
  });

  // The script cannot import the *.i18n.json sources, so it carries a copy.
  it('carries exactly the English strings of the i18n sources', () => {
    const block = (name: string) => new RegExp(`${name}: \\{([\\s\\S]*?)\\n    \\}`).exec(PREFLIGHT)![1];
    const embedded = (name: string) => new Function(`return {${block(name)}};`)();

    expect(embedded('Unsupported')).toEqual(unsupportedI18n.Unsupported);
    expect(embedded('BrowserFeature')).toEqual(browserFeatureI18n.BrowserFeature);
  });
});

describe('getBrowserSupport', () => {
  afterEach(() => {
    delete window.Cockatrice;
  });

  it('reads the preflight result', () => {
    window.Cockatrice = { browserSupport: { missingRequired: [], missingOptional: ['worker'] } };
    expect(getBrowserSupport()).toEqual({ missingRequired: [], missingOptional: ['worker'] });
  });

  it('reports full support when the preflight did not run', () => {
    expect(getBrowserSupport()).toEqual({ missingRequired: [], missingOptional: [] });
  });
});
