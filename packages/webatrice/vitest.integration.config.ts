import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Integration test suite (`npm run test:integration` / `test:integration:coverage`).
//
// Purpose: exercise feature flows and command/event round-trips against a real
// Redux store and real Datatrice reducers, driven by protobuf payloads. Specs
// live in the top-level `integration/` tree as `integration/src/**/*.spec.{ts,tsx}`.
//
// Boundary: only the WebSocket *constructor* is mocked (see
// `integration/src/helpers/setup.ts`) — everything downstream of the socket is
// real. There is no real browser and no real Servatrice; tests needing those
// belong in the e2e suite (`playwright.config.ts`). This suite is not a
// superset of the unit suite — it deliberately exercises different paths.
const REAL_DEXIE_SPECS = 'integration/src/services/dexie/**/*.spec.ts';

export default defineConfig({
  ...viteConfig,
  test: {
    ...viteConfig.test,
    setupFiles: ['./integration/src/helpers/setup.ts'],
    // Each project below lists its own specs: a project's include is added to,
    // not replaced by, the one it extends.
    include: [],
    exclude: ['node_modules', 'build', 'coverage'],
    // Threads, not forks: Webatrice's forks-on-Windows hit Vitest 4's hardcoded
    // 60s worker-startup timeout intermittently as the integration setup.ts
    // cold-starts datatrice + sockatrice + protobuf per fork. A VM pool, as in
    // the unit suite, still gives every spec file a fresh jsdom and module graph,
    // but loads node_modules and jsdom's code once per worker rather than once
    // per spec file, which cuts the suite's time by about a third.
    pool: 'vmThreads',
    // The unit suite's heap flag is for its child processes; a worker
    // thread refuses V8 flags and never starts.
    execArgv: [],
    // Real-Dexie specs stay on plain threads. In a VM context Dexie cannot
    // follow the test realm's promises through a transaction and commits it
    // early (PrematureCommitError). That realm mismatch cannot happen in a
    // browser, but the error can, so these specs keep their real behaviour.
    projects: [
      {
        extends: true,
        test: { name: 'integration', include: ['integration/src/**/*.spec.{ts,tsx}'], exclude: [REAL_DEXIE_SPECS] },
      },
      {
        extends: true,
        test: { name: 'integration-dexie', include: [REAL_DEXIE_SPECS], pool: 'threads' },
      },
    ],
    coverage: {
      ...viteConfig.test?.coverage,
      reportsDirectory: './coverage/integration',
      // The integration suite owns feature flows + store / app-shell wiring.
      // Pure leaf UI (`components/`, `dialogs/`) and pure utilities are the
      // unit suite's domain, so they are scoped out of the integration gate.
      // `feature-widgets/` has dedicated unit coverage and is not the
      // integration suite's primary concern.
      include: [
        'src/features/**/*.{ts,tsx}',
        'src/feature-wrappers/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/services/**/*.{ts,tsx}',
        'src/store/**/*.{ts,tsx}',
        'src/AppShell.tsx',
        'src/AppShellRoutes.tsx',
        'src/clientConfig.ts',
      ],
    },
  },
});
