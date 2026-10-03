# Webatrice agent onboarding

Verified against Webatrice `cfdf276368f6663db71a952665fafb0adee307ec` on 2026-08-24.

Related: [Current state](current-state.md) · [Cockatrice parity matrix](cockatrice-parity-matrix.md) · [Audit limitations](audit-limitations.md)

## Purpose and terminology

Webatrice is a desktop-browser client for Cockatrice's Servatrice server. **Cockatrice** is the Qt/C++ reference client; **Servatrice** is the server (the repository folder is `servatrice/`); **Sockatrice** is Webatrice's TypeScript protocol/WebSocket package; **Datatrice** is its Redux state and response-normalization package.

Desktop Cockatrice behavior is the functional specification. A browser-native workflow can differ visually when it preserves the full capability and material behavior.

## Prerequisites

- Git with submodule and sparse-checkout support.
- Node.js 24.x, the version used by `.github/workflows/ci.yml`. Library manifests allow Node `>=20`, but Node 24 is the verified target.
- npm 10.9.4, declared by the root `packageManager` field. The audit also installed successfully with npm 11.17.0, but it rewrote lockfile metadata, so use the declared version for clean diffs.
- Docker with Compose for Servatrice-backed e2e tests. Docker Desktop 4.87.0 with Linux Engine 29.7.2 is the verified Windows configuration.
- Chromium installed through Playwright for the app e2e suite.

The `@cockatrice` npm scope points at GitHub Packages in `.npmrc`. The audited lockfile installed without credentials in the prepared sandbox; a clean environment may need package access if it cannot resolve cached/public artifacts.

## Setup, build, test and run

Run from the repository root unless stated otherwise.

```powershell
npm install
npm run typecheck
npm run build
npm start
```

`npm install` runs the root `prepare` hook: it initializes the sparse Cockatrice submodule, regenerates Sockatrice protobuf bindings, runs Webatrice prebuild, and installs Husky hooks. `npm start` runs the package dependency builds and Vite dev server; Vite is configured to open a browser automatically at `http://localhost:5173`.

Validated test commands:

```powershell
npm test
npm run test:integration
npm run lint
npm run test:e2e
```

`npm test`, `npm run test:integration`, and `npm run test:e2e` passed at the baseline. The e2e run passed two Sockatrice real-Servatrice tests and six Webatrice Chromium tests, then removed both Compose projects' containers, networks and volumes. `npm run lint` is a valid command but currently fails in Webatrice with 3,555 errors; do not treat a non-zero result as an environment problem without reading the report. The first e2e run pulls the pinned Servatrice/MySQL images and downloads Playwright Chromium, so allow extra time and network access. Never point these tests at a production server.

Package-focused commands use npm workspaces, for example:

```powershell
npm run -w @cockatrice/sockatrice test
npm run -w @cockatrice/datatrice test:integration
npm run -w @cockatrice/webatrice test:watch
npm run -w @cockatrice/webatrice test:coverage
npm run -w @cockatrice/webatrice dev -- --host 127.0.0.1 --open=false
```

The root `golden` task runs each workspace's lint, unit and integration gate after dependency builds. It currently fails when it reaches Webatrice lint.

## Important directories and entry points

| Read first | Why |
|---|---|
| `README.md`, `package.json`, `turbo.json` | Supported root commands and workspace task graph. |
| `.github/instructions/webatrice.instructions.md` | Current app architecture and cross-layer invariants. The older README reference to `root.instructions.md` was stale. |
| `.github/instructions/sockatrice*.instructions.md` | Command/response, transport, reconnect, keepalive and URL rules. |
| `.github/instructions/datatrice*.instructions.md` | Redux normalization, proto field-presence and game-event invariants. |
| `packages/webatrice/src/index.tsx` | Provider composition and popup carve-out. |
| `packages/webatrice/src/AppShell.tsx`, `AppShellRoutes.tsx`, `types/routes.ts` | MemoryRouter, navigation and registered routes. |
| `packages/sockatrice/src/WebClient.ts` | Singleton client, request scopes, reconnect configuration and status handling. |
| `packages/sockatrice/src/services/ProtobufService.ts` | Command serialization/correlation and event extension dispatch. |
| `packages/datatrice/src/api/attachResponseHandlers.ts` | Inbound bridge from Sockatrice to Redux. |
| `packages/datatrice/src/store/rootReducer.ts` | `server`, `rooms`, and `games` ownership. |
| `packages/webatrice/src/store/index.ts` | Webatrice's `action` and `shortcuts` extension slices and typed hooks. |
| `packages/webatrice/src/services/dexie/` | Browser persistence and migrations. |
| `packages/webatrice/src/features/` | Route-level feature code. |
| `architecture/*.mmd` | Existing high-level and sequence diagrams. |

For parity work, use a full checkout of `https://github.com/Cockatrice/Cockatrice.git`; Webatrice's `vendor/cockatrice` submodule is sparse and normally contains only protocol definitions. Cockatrice UI is under `cockatrice/src/`, shared libraries under `libcockatrice_*`, protocol definitions under `libcockatrice_protocol/`, and server behavior under `servatrice/`.

## Architectural reading order

1. Read `webatrice.instructions.md`, then the scoped instruction file for the area you will touch.
2. Follow one outgoing action: feature component/hook → `useWebClient()` → Sockatrice command builder → `ProtobufService` → generated protocol.
3. Follow its incoming effect: event/response registry → Datatrice `*ResponseImpl` → listener/reducer → selector → feature render.
4. Read the equivalent Cockatrice action, widget and game/server handler before deciding behavior.
5. Check the unit, integration and e2e specs for the same feature before classifying or changing it.

Do not instantiate or runtime-import `WebClient` from feature UI; obtain it through `useWebClient()`. Do not dispatch server-data mutations directly from UI except the documented optimistic `useLeaveGame` exception. Preserve protobuf field presence: proto3 unset scalar values look like zero/empty, while some proto2 defaults use `-1`.

## Common workflows

### Add or change a protocol-backed feature

1. Locate the Cockatrice behavior and protocol command/event.
2. Add or verify the Sockatrice command/event mapping and protocol-presence tests.
3. Add or verify Datatrice response/listener/reducer/selector behavior.
4. Expose the workflow through a Webatrice feature hook/component.
5. Test the smallest layer, then add an integration round trip; use Playwright only for behavior requiring a real browser/Servatrice.

### Change generated protocol bindings

```powershell
npm run assets:submodule
npm run -w @cockatrice/sockatrice proto:generate
npm run typecheck
```

The source of truth is `vendor/cockatrice/libcockatrice_protocol/`. Review generated diffs; do not hand-edit generated binding files.

### Change translations

Edit a co-located `*.i18n.json`, then run:

```powershell
npm run -w @cockatrice/webatrice translate
```

`packages/webatrice/src/i18n-default.json` is generated and committed. Duplicate keys fail prebuild.

### Change IndexedDB data

Add a Dexie version in `services/dexie/DexieSchemas/` and integration coverage under `integration/src/services/dexie/`. Dexie cannot change a primary key in place; the existing card/set migration demonstrates drop-and-recreate behavior.

## Debugging and validation

- Redux DevTools can inspect normalized state because `polyfills.ts` serializes BigInt values to strings for diagnostic JSON. Keep that import first in both app and test entry points.
- For protocol debugging, inspect `cmdId` in `ProtobufService` and compare the generated extension used by the corresponding Cockatrice command/event.
- A command sent while the socket is not `OPEN` is dropped with a console warning; command callbacks have no timeout.
- For connection issues, verify `buildWebSocketUrl`: a host containing `/` is a reverse-proxy path and must not receive an appended port.
- Integration tests are the fastest useful boundary for WebSocket bytes → event registry → Datatrice store → feature UI. They do not prove a real server/browser flow.
- E2E uses `packages/webatrice/playwright.config.ts`, one desktop Chromium project, Vite preview on port 4173, and the pinned Docker image from `.env.e2e`. The verified suite covers boot, registration/login/known-host persistence, foreground connection stability, game create/join/deck/core play, spectating, and bulk card actions; it does not prove forced-drop recovery or non-Chromium support.

## Known traps and environmental assumptions

- App routing uses `MemoryRouter`; the visible URL is not the route. Sticky tabs and the last internal route persist in `localStorage`.
- The card-preview popup boots the same bundle without Redux/router providers and communicates through `BroadcastChannel`.
- `WebClient` is a singleton. Use `WebClient.dispose()` only at lifecycle/test boundaries.
- Datatrice's listener middleware is also a module singleton; repeated store creation is guarded.
- Immer does not draft protobuf-es proto2 messages. Reducers must clone and reassign them, not mutate in place.
- `gameStateChanged` resyncs can omit player `userInfo`; Datatrice deliberately carries prior identity forward.
- Hidden opponent card moves may contain `card_id = -1`; maintain authoritative zone counts even when identity is unknowable.
- Windows/sandbox Git ownership checks can break `prebuild.js` because it calls `git rev-parse HEAD`. Fix the environment's safe-directory ownership configuration rather than changing production code.
- Some Windows PowerShell environments omit Git's `usr/bin` utilities from `PATH`, causing `git submodule` scripts to miss `basename`/`sed`.
- Node/npm module-type warnings currently originate from `packages/webatrice/postcss.config.js`.
- The baseline production build has chunks above Vite's 500 kB warning threshold.
- Firefox and Safari are not in the Playwright project list; treat their behavior as unverified until tested.

Before handing off work, check the [current-state validation results](current-state.md#verified-build-and-test-status) and update the [parity matrix](cockatrice-parity-matrix.md) when a user-visible Cockatrice gap changes status.
