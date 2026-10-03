# feat(shell): declare supported browsers, preflight required APIs, and gate e2e typecheck + forced-drop reconnect

> **Stacks on parity/06-e2e-hardening** (`d2e3d1e`). Review and merge after #06. Branch `claude/parity-24-platform-gates` (tip `66f0806`).

## Summary
- **Supported browsers are declared (PLAT-026).** The production `browserslist` was `>0.2%, not dead`, and nothing used it. It now lists Chrome/Edge 111, Firefox 114, and Safari/iOS 16.4. That is Vite 8's `baseline-widely-available` target, which `vite.config.ts` now sets explicitly, with a comment linking the two. These are the engines the e2e matrix runs (Chromium, Firefox, WebKit). The README has a short "Supported browsers" section, which says the page must be served over https:// or from localhost.
- **Startup capability preflight.** `utils/browserSupport.ts` checks the APIs the code actually uses (found by grep):
  - **Required:** WebSocket; Web Crypto (`getRandomValues` + `subtle.digest`, which is missing outside a secure context, so password hashing would throw at login); TextEncoder; BigInt (protobuf int64); `structuredClone` (action slice); `fetch` + `AbortController`; the IndexedDB global.
  - **Optional, each with an existing fallback where it is used:** Worker (keep-alive falls back to a main-thread timer); BroadcastChannel (pop-out card preview); ResizeObserver (card scale and arrows); the Clipboard API (copy buttons).
- **Unsupported screen, no app boot.** When a required API is missing, `index.tsx` renders `Unsupported` with a list of the missing features and stops there. No store, WebClient, socket or analytics is created. `Unsupported` no longer wraps itself in `Layout`, so it needs nothing but i18n. It uses theme tokens and `*.i18n.json` strings (`Unsupported.missing`, `BrowserFeature.*`). The `/unsupported` route that the async Dexie test navigates to uses the same component.
- **Soft degrade.** `FeatureDetection` keeps the Dexie open test. It also shows one warning toast per page load naming the optional features that are missing. To make that a warning, `pushToast` gets a `severity` option, plumbed like `icon`.
- **No blank page before the preflight runs.** The BigInt `toJSON` polyfill is guarded. The i18n backend starts `fetch` inside a promise, so a missing `fetch` falls back to the bundled English instead of throwing.
- **`e2e/` typechecks (PLAT-028).** A new `e2e/tsconfig.json` covers the specs, fixtures, page objects and `playwright.config.ts` (node types, shared base). Webatrice's `typecheck` script is now `tsc --noEmit && tsc -p e2e --noEmit`, so `turbo typecheck` and CI's Typecheck job include it. I checked that a deliberate type error in `e2e/` fails it.
- **Forced-drop reconnect e2e (`connection-drop.spec.ts`).** Every socket to the docker Servatrice is routed through `page.routeWebSocket` + `connectToServer`, which forwards frames unchanged. Mid-session the test closes the server side. It then asserts:
  - the app is back on the login screen showing "Connection Closed", with the Connected indicator gone;
  - after 10 s it is still disconnected (no auto-reconnect);
  - an explicit login restores the session.

  CI's app-e2e matrix already runs chromium, firefox and webkit, so the spec runs on all three.
- **`browser-support.spec.ts`.** An `addInitScript` blanks `WebSocket` before the bundle loads. The test asserts the "Unsupported Browser" heading, a single list item naming WebSockets, and no login screen behind it. A second test blanks `BroadcastChannel` and asserts the app boots with the degraded-features warning.

## Parity rows closed
- **PLAT-026**: closed. Browser support is declared and matches the build target and the e2e matrix. Required APIs are checked before boot, with an actionable unsupported screen. Optional ones degrade with a notice. All of this is tested in jsdom and on Chromium, Firefox and WebKit.
- **PLAT-028**: closed for the items still open after #01/#06: `e2e/` is in `typecheck`, and the forced-drop reconnect outcome is asserted on all three browsers.

## Desktop reference
- `cockatrice/src/client/network/connection_controller/remote_connection_controller.cpp` `ConnectionController::onSocketError`: shows "Socket error: %1", then `connectToServer()` reopens the Connect dialog. `libcockatrice_network/.../remote_client.cpp` `slotSocketError` / `slotWebSocketError`: `doDisconnectFromServer()`, no retry. Webatrice matches this: the session ends, the login screen shows "Connection Closed", and the user must log in again. `CLIENT_OPTIONS` sets no `reconnect` policy, so Sockatrice's opt-in reconnect stays off.
- PLAT-026 has no desktop counterpart (Qt native runtime). Browser support follows the Vite baseline target.

## Testing
All run from the repo root on the tip, against Servatrice 3.0.0 (default image), with Vitest at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed. This now includes `tsc -p e2e`.
- `npm run lint`: 3/3 packages, 0 problems.
- `npm test`:
  - sockatrice: 775 passed.
  - datatrice: 1196 passed.
  - webatrice: 1497 passed, 2 skipped (pre-existing). That is 21 more tests than #06's 1476: 15 in `browserSupport.spec.ts`, 2 in FeatureDetection, 2 in Unsupported and 2 for toast severity.
- `npm run test:integration`:
  - sockatrice: 166 passed.
  - datatrice: 136 passed.
  - webatrice: 160 passed, 2 skipped (pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice`: the host's Playwright browsers are the wrong build, so the browser part ran inside `mcr.microsoft.com/playwright:v1.60.0-noble` (brief's container path). 15 tests × 3 browsers = 45 per run.
  - Targeted run of the two new specs: 9/9 passed.
  - Full run 1: 42 passed, 3 failed. The 3 failures are `staff-tools` "an admin publishes a new server message", all with `spawnSync docker ENOENT`. That spec seeds MySQL through `docker compose exec`, and the Playwright image has no docker CLI. This is an environment limit, not a regression.
  - Full run 2: identical (42 passed, the same 3 environmental failures).
  - The `connection-drop` and `browser-support` specs passed 9/9 in each of the three runs. That is 9 passes of the reconnect spec, 3 per browser.
  - Re-run of `staff-tools` with the host docker CLI, compose plugin and socket mounted into the container: **6/6 passed**. So every e2e test passes in this environment.
- `npm run test:e2e -w @cockatrice/sockatrice`: not run. No sockatrice code or server flow changes.

## Notes for reviewers
- **Changeset:** `.changeset/browser-support-preflight.md` (`@cockatrice/webatrice`: minor).
- **`src/i18n-default.json`:** contains only the new keys. The pre-commit hook's regeneration reorders keys, so I kept that reorder churn out (the content is identical to `npm run translate` output).
- **Hard vs. soft.** I made `indexedDB` required in the synchronous check because Dexie holds settings and known hosts, so the login screen cannot work without it. The async open test still covers private modes where the global exists but opening a database fails. I left `localStorage` out: in browsers where it is disabled it throws on access, and auditing every caller is out of scope here.
- **The drop simulates the network, not app code.** It closes the server side of a Playwright-proxied socket. The page sees an unrequested close, as with a dead link or a server restart.
- **e2e environment tip for anyone running in the Playwright container:** mount `/usr/bin/docker`, `/usr/libexec/docker/cli-plugins` and `/var/run/docker.sock` so `staff-tools`' SQL seeding works.
- **Follow-ups:**
  - `sockatrice/e2e` and the `integration/` folders also have no typecheck step.
  - A desktop-style modal ("Socket error: …") instead of the login status line is a possible UX refinement. This PR keeps the existing notice.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
