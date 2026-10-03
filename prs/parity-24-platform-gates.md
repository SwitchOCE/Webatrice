# feat(shell): declare supported browsers, preflight required APIs, and gate e2e typecheck + forced-drop reconnect

> **Stacks on parity/06-e2e-hardening** (`d2e3d1e`). Review and merge after #06. Branch `claude/parity-24-platform-gates` (tip `61fd4f4`).

## Summary
- **Supported browsers are declared (PLAT-026).** The production `browserslist` was `>0.2%, not dead`. It now lists Chrome/Edge 111, Firefox 114 and Safari/iOS 16.4, the engines the e2e matrix runs (Chromium, Firefox, WebKit). `browserslist` drives autoprefixer (`postcss.config.js`), so the CSS now carries fewer vendor prefixes. The Vite build target is pinned to the same versions (`['chrome111','edge111','firefox114','safari16.4']`) instead of the floating `baseline-widely-available` alias. The README has a "Supported browsers" section.
- **Preflight before the module graph.** `public/preflight.js` is a classic ES5 script that `index.html` runs before the module entry. ESLint parses it with espree at `ecmaVersion: 5`, so newer syntax is a lint error. It checks:
  - **Required:** the ES2022 syntax the build emits, checked with a parse-only `new Function` probe (a CSP `EvalError` counts as unknown, not missing); ES module support (the `noModule` property); BigInt; WebSocket; `crypto.getRandomValues`; TextEncoder; `structuredClone`; `fetch` + `AbortController`; the IndexedDB global; ResizeObserver.
  - **Optional:** Web Crypto (`crypto.subtle`); Worker; BroadcastChannel; the Clipboard API.

  Each probe runs in its own try/catch, so a throwing host getter counts as missing. The result is published on `window.Cockatrice.browserSupport`.
- **The app bundle is not fetched for an unsupported browser.** `src/index.tsx` is now a tiny entry. It reads the preflight result and only then does `import('./boot')`; `boot.tsx` is the old entry, unchanged. The Vite preload helper gets its own chunk, so the entry statically pulls in about 1 kB and no vendor code. When something required is missing, the preflight renders the screen itself. An engine that cannot parse the bundle therefore gets the screen, not a blank page.
- **ResizeObserver is required.** `PlayerBox` (two sites), `IncomingRevealDialog`, `LibrarySearchDialog` and `ZoneRevealDialog` use it unguarded.
- **Web Crypto is soft.** `crypto.subtle` exists only in a secure context. Plain http:// deployments (LAN, `vite --host`) now boot with a warning instead of being blocked. Sockatrice gains `passwordHashAvailable()`. When the client cannot hash, login, register, activation, password reset and password change take the plain-password path that `serverIdentification.ts` already uses for a server without hashing or for an empty salt. The server capability is still recorded and reported unchanged. `getRandomValues` works outside a secure context and stays required.
- **Unsupported screen, i18n and theme within a pre-bundle script.** The screen is a `<main>` landmark with the title, the missing features and the note. It cannot use i18next or the bundled CSS. Instead it:
  - carries the English strings of `Unsupported.i18n.json` / `BrowserFeature.i18n.json`;
  - loads the user's language (`i18nextLng`, else `navigator.language`, then its primary subtag) from `public/locales` with an XMLHttpRequest, since `fetch` may be the missing API, and re-renders when the translation arrives;
  - sets the `tokens.css` custom properties it uses on its root.

  A unit spec fails if either copy drifts from its source. The `/unsupported` route, which the async Dexie open test navigates to after boot, is back to the parent's `Layout` page.
- **Soft degrade.** `FeatureDetection` reads the preflight result and shows one warning toast per page load naming the missing optional features. `pushToast` gets a `severity` option for this.
- **`e2e/` typechecks (PLAT-028).** `e2e/tsconfig.json` covers the specs, fixtures, page objects and `playwright.config.ts`. The check is non-strict, inherited from the base config. Webatrice's `typecheck` is `tsc --noEmit && tsc -p e2e --noEmit`.
- **Forced-drop reconnect e2e (`connection-drop.spec.ts`).** Every socket is proxied with `page.routeWebSocket`, and the test closes the server side mid-session. It asserts the login screen shows "Connection Closed", there is no auto-reconnect within 10 s, and an explicit login restores the session.
- **`browser-support.spec.ts`.** An init script blanks `WebSocket`, and in a second test `ResizeObserver`, before any page script runs. Each test asserts the screen heading inside `main`, the single list item, that `#root` holds only the screen, and that no `boot-*`/`vendor-*` script was requested. A third test blanks `crypto.subtle` and asserts the app boots to the login screen with the password-hashing warning.

## Parity rows closed
- **PLAT-026**: closed. Browser support is declared and matches the build target and the e2e matrix. Syntax, module support and required APIs are checked by a classic script before the bundle loads, with an actionable unsupported screen. Optional ones degrade with a notice. All of this is tested in jsdom and on Chromium, Firefox and WebKit.
- **PLAT-028**: closed for the items still open after #01/#06: `e2e/` is in `typecheck`, and the forced-drop reconnect outcome is asserted on all three browsers.

## Desktop reference
- `cockatrice/src/client/network/connection_controller/remote_connection_controller.cpp` `ConnectionController::onSocketError`: shows "Socket error: %1", then `connectToServer()` reopens the Connect dialog. `libcockatrice_network/.../remote_client.cpp` `slotSocketError` / `slotWebSocketError`: `doDisconnectFromServer()`, no retry. Webatrice matches this: the session ends, the login screen shows "Connection Closed", and the user must log in again. `CLIENT_OPTIONS` sets no `reconnect` policy, so Sockatrice's opt-in reconnect stays off.
- PLAT-026 has no desktop counterpart (Qt native runtime). Browser support is the pinned Vite build target. The insecure-context password fallback mirrors desktop's plain-password login to a server without `SupportsPasswordHash`, the path `serverIdentification.ts` already takes.

## Testing
All run from the repo root on the tip `61fd4f4`, against Servatrice 3.0.0 (the default image), with Vitest at `--maxWorkers=2`. Typecheck also passed at every commit of the branch (`git rebase -x`).
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed. This includes `tsc -p e2e`.
- `npm run lint`: 3/3 packages, 0 problems. This now includes `public/preflight.js` as ES5. I checked that an arrow function in it fails lint.
- `npm test`:
  - sockatrice: 781 passed. That is +6: 2 `passwordHashAvailable`, 3 serverIdentification no-hash cases, 1 accountPassword.
  - datatrice: 1196 passed.
  - webatrice: 1507 passed, 2 skipped (pre-existing). `browserSupport.spec.ts` now runs `public/preflight.js` against a stand-in `window`. Its 27 tests cover each required and optional feature, the syntax probe (SyntaxError vs CSP EvalError), the module check, a throwing getter, the rendered screen (`<main>`, list contents), token values against `tokens.css`, translation loading and fallback, the sync between the embedded strings and the i18n sources, and `getBrowserSupport`.
- `npm run test:integration`:
  - sockatrice: 166 passed.
  - datatrice: 136 passed.
  - webatrice: 160 passed, 2 skipped (pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice`: built on the host. The browser part ran inside `mcr.microsoft.com/playwright:v1.60.0-noble`, because the host's Playwright browsers are the wrong build. The host docker CLI and socket were mounted for `staff-tools`' SQL seeding. Result: **48/48 passed** (16 tests × chromium, firefox, webkit) in 13.1 min, including the 3 `browser-support` tests per browser.
- `npm run test:e2e -w @cockatrice/sockatrice`: 5/5 passed (4 files). Run because the login path changed.
- Production build: the entry chunk is 1.4 kB and statically imports only `preload-helper` (1.2 kB). `boot` and every vendor chunk are behind the dynamic import.

## Notes for reviewers
- **Changesets:**
  - `.changeset/browser-support-preflight.md` (`@cockatrice/webatrice`: minor);
  - `.changeset/password-hash-insecure-context.md` (`@cockatrice/sockatrice`: patch).
- **Behaviour change on http://.** Before this PR, a salted login from an insecure context threw inside `hashPassword` and hung. Now it sends the plain password, as desktop does to a server without hashing, and the startup warning says so. Deployments that care should serve https://, which the README now recommends.
- **Trade-off of the pre-bundle screen.** It cannot share i18next, MUI or the bundled CSS:
  - its strings and tokens are copies, and a spec fails on any drift;
  - translations are best effort: the English screen shows at once and is replaced if `public/locales/<lang>/translation.json` loads;
  - the screen and the `/unsupported` route (Dexie open failure, after boot) are now separate renderings. Same strings, different chrome.
- **Fallback if the preflight does not run.** For example, a deploy that drops `preflight.js`: `getBrowserSupport()` reports full support and the app boots as before the preflight existed.
- **Hard vs. soft.**
  - `indexedDB` is required, because Dexie holds settings and known hosts. The async open test still covers private modes.
  - `localStorage` is left out: it throws on access where disabled, and auditing every caller is out of scope here.
  - The syntax probe is a sample of ES2022 syntax (class fields, private names, static blocks, `??=`, optional chaining, spread, async generators, optional catch binding, BigInt literals), not a full parse of the bundle.
- **`src/i18n-default.json`** is the generator's output, committed as is.
- **The drop simulates the network, not app code.** The test closes the server side of a Playwright-proxied socket.
- **e2e environment tip:** in the Playwright container, mount `/usr/bin/docker`, `/usr/libexec/docker/cli-plugins` and `/var/run/docker.sock`.
- **Follow-ups:**
  - `sockatrice/e2e` and the `integration/` folders have no typecheck step.
  - The `e2e/tsconfig.json` check is non-strict.
  - The `connection-drop` fixed 10 s wait and the FeatureDetection interpolation assertion (rv4 minors) are not in this rework's task list.
  - A desktop-style "Socket error" modal is a possible UX refinement.

## Review response (rv4)
- **ResizeObserver classed optional (major) → fixed.** It is now required. The label and changeset are updated, and e2e asserts the screen without it.
- **Preflight inside the module graph (major) → fixed.** The checks are in a classic ES5 `public/preflight.js` that runs before the module entry. `src/index.tsx` only dynamic-imports `./boot` once the preflight passes. The preload helper is split out so the entry fetches no vendor code, and e2e asserts that no `boot`/`vendor` script is requested.
- **Unreachable BigInt check (major) → fixed by the move.** BigInt and modern syntax are now checked before the bundle parses. The `polyfills.ts` guard and the `i18n-backend` wrapper are reverted.
- **`webCrypto` hard gate on http:// (major) → fixed.** `crypto.subtle` is optional, with a warning. Sockatrice falls back to the plain password, matching `serverIdentification.ts`. The behaviour change is called out in both changesets.
- **No exception isolation (minor) → fixed.** Each probe is wrapped in try/catch, with a spec for a throwing getter.
- **Floating build target (minor) → fixed.** The target is pinned to explicit versions.
- **The browserslist claim (minor) → fixed.** The PR text, README and changeset now say it drives autoprefixer, and mention the CSS-prefix change.
- **No `<main>` landmark (minor) → fixed.** The preflight screen renders `<main>`, and the route keeps `Layout`'s `<main>`.
- **The e2e "no login behind it" assertion could not fail (minor) → fixed.** It now asserts that `#root` holds only the screen and that no app chunk was fetched.
- **No StrictMode on the pre-boot tree (nit) → moot.** The tree is no longer React.
- **`i18n-default.json` hand-trimmed (nit) → fixed.** The generator's output is committed as is.
- **Not changed (outside this task's list):**
  - FeatureDetection interpolation assertion;
  - `connection-drop` fixed wait;
  - e2e `strict` (noted as non-strict above).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
