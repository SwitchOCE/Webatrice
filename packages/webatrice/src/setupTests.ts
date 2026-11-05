import './polyfills';

import '@testing-library/jest-dom/vitest';

// jsdom doesn't provide ResizeObserver; react-window needs it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// jsdom doesn't implement Element.scrollIntoView; ScrollToBottomOnChanges uses it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Dexie eagerly opens IndexedDB on import; jsdom's fake-indexeddb is memory-intensive.
vi.mock('dexie', () => {
  const whereTerminator = { first: () => Promise.resolve(null) };
  const fakeTable = {
    mapToClass: () => {},
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    add: () => Promise.resolve(1),
    bulkAdd: () => Promise.resolve(),
    bulkPut: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    bulkDelete: () => Promise.resolve(),
    count: () => Promise.resolve(0),
    clear: () => Promise.resolve(),
    toArray: () => Promise.resolve([]),
    where: () => ({
      equals: () => whereTerminator,
      equalsIgnoreCase: () => whereTerminator,
    }),
  };
  const settingsRows = new Map<string, any>();
  let settingsClass: any;
  let settingsWrites = Promise.resolve<unknown>(undefined);
  const copySetting = (row: any) => row
    ? Object.assign(Object.create(settingsClass?.prototype ?? Object.prototype), structuredClone(row))
    : undefined;
  const settingsTable = {
    ...fakeTable,
    mapToClass: (ctor: any) => {
      settingsClass = ctor;
    },
    get: (user: string) => Promise.resolve(copySetting(settingsRows.get(user))),
    put: (row: any) => {
      settingsRows.set(row.user, structuredClone(row));
      return Promise.resolve(row.user);
    },
    clear: () => {
      settingsRows.clear();
      return Promise.resolve();
    },
    where: () => ({
      equalsIgnoreCase: (user: string) => ({
        first: () => Promise.resolve(copySetting([...settingsRows.values()]
          .find((row) => row.user.toLowerCase() === user.toLowerCase()))),
      }),
    }),
  };
  afterEach(() => {
    settingsRows.clear();
    settingsWrites = Promise.resolve();
  });
  class FakeDexie {
    version() {
      const chain = { stores: () => chain, upgrade: () => chain };
      return chain;
    }
    open() {
      return Promise.resolve(this);
    }
    table(name: string) {
      return name === 'settings' ? settingsTable : fakeTable;
    }
    transaction(...args: unknown[]) {
      const work = args[args.length - 1] as () => unknown;
      if (args.flat().includes(settingsTable)) {
        const result = settingsWrites.then(work);
        settingsWrites = result.catch(() => undefined);
        return result;
      }
      return Promise.resolve().then(work);
    }
  }
  return {
    default: FakeDexie,
    liveQuery: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    __esModule: true,
  };
});

// See .github/instructions/webatrice-testing.instructions.md#mocking-footguns.
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
