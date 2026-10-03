# test(e2e): make the browser e2e hermetic and fix the worker that never exits

## Summary
- **The browser e2e is hermetic now.** Specs import `test` from the new `e2e/fixtures/test.ts`. Every context it creates goes through `e2e/fixtures/network.ts`, which routes all non-localhost traffic:
  - Public game servers (the `DefaultHosts` WebSockets) are unreachable. The socket is closed before the server identifies itself.
  - Scryfall answers from fixtures: a trimmed Forest card record, placeholder card images and mana symbols, and Scryfall's 404 error shape for anything else.
  - Google Fonts gets an empty stylesheet.
  - Any other external request is refused, and the test fails with the URL list. A new external dependency shows up as a failure instead of quietly reaching the internet.
- **Root cause of `worker-N process did not exit within 300000ms`.** On Windows, WebKit's network process can outlive the browser while it still holds sockets to external hosts. On this host I found orphaned `WebKitNetworkProcess.exe` processes from earlier runs. Their parents were dead, and they still held `CLOSE_WAIT` sockets to `api.scryfall.com`, `svgs.scryfall.io` and `fonts.gstatic.com`.
  - WebKit starts its child processes with handle inheritance, so they also hold the browser's stdio pipes.
  - Playwright's launcher (`processLauncher` `gracefullyClose` → `waitForCleanup`) waits for the browser's `close` event, which needs every pipe handle closed. So the webkit worker waits until the runner force-kills it after 5 minutes.
  - With no external sockets there is nothing to wedge. During the final runs a netstat sampler, checked against the known orphans, saw no external sockets from any page.
- **app-boots no longer depends on Chickatrice.** The login screen's automatic test-connection hit `wss://mtg.chickatrice.net`, which failed webkit app-boots on a TLS error. It now gets a deterministic "unreachable", and the spec still asserts that the app mounts with no page or console errors.
- **Fixtures carry behaviour, not only art.** The board reads a card's Scryfall type line to decide where a double-clicked card goes. With no Forest record the cards missed the battlefield, so the Forest record stays.
- **Reliability fixes found along the way:**
  - `joinFirstRoom` lost a race with Servatrice's auto-join, which navigates into the room after the Lobby is already shown. It now retries until the room's game list shows.
  - Multi-client specs no longer close their contexts in a `finally`. The fixture closes them after the failure is recorded, so failed runs keep a page snapshot.
  - `vite preview` is never reused from a port another checkout may hold.
- **Lint covers `integration/` and `e2e/`** in every package's `lint` script.
  - The violations it found are fixed: long imports reflowed, inline comments, braceless ifs and unused imports.
  - `resetDexie.ts` was flagged because the boundaries patterns classified `integration/src/services/**` as the services layer. Integration code is now exempt from the layer rules, like specs.
  - ESLint now rejects Playwright's own `test` and `browser.newContext()` in `e2e/specs/`, so a spec cannot bypass the isolation.

## Parity rows closed
n/a. This is test infrastructure.

## Desktop reference
n/a.

## Testing
All run from the worktree root, with Vitest capped at `--maxWorkers=2`:
- `npm run typecheck`: passed (5/5 tasks).
- `npm run lint`: passed for all three packages, 0 problems. It now includes integration and e2e.
- `npm test`:
  - sockatrice: 735 passed.
  - datatrice: 1147 passed.
  - webatrice: 1279 passed, 2 skipped (both skips pre-existing).
- `npm run test:integration`:
  - sockatrice: 159 passed.
  - datatrice: 127 passed.
  - webatrice: 142 passed, 2 skipped (pre-existing).
- e2e files also typecheck with a temporary tsconfig over `e2e/` (no errors).
- `npm run test:e2e -w @cockatrice/webatrice` (Servatrice 3.0.0, under the e2e mutex, `DEBUG=pw:browser`), on the final code: **two consecutive runs, each 21/21 passed, exit 0, in 388 s and 393 s.**
  - Each run had 12 browser closes, all of which reached `gracefully close end`.
  - There were 0 force kills, no `did not exit`, and no new orphaned WebKit processes.
- Earlier runs during the work:
  - 21/21 green, exit 0.
  - 20/21: webkit login `selectHost` (see notes).
  - 20/21: the firefox auto-join race, which is fixed.
  - A 20× webkit repeat of `login-join-room`: 20/20.
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests passed, exit 0. This suite was already hermetic: node `ws` to localhost:4749 only.

## Notes for reviewers
- **No changeset.** Only test code, lint config and lint scripts change, and no published package's output changes. That follows the convention of the earlier lint-only PR.
- **One unexplained webkit flake (1 in about 100 login flows).** In `LoginPage.selectHost`, the newly added `e2e` host row was not found after opening the picker. It did not reproduce in 20 webkit repeats. Earlier, the `finally` closes meant the failure kept no page snapshot. Now it will, so the next occurrence can be diagnosed. I did not add a retry around it, because that could hide a real dropdown bug.
- **Firefox keeps one browser-level connection to Mozilla's CDN** (`2a04:4e42:13::347`, Fastly; for example `firefox.settings.services.mozilla.com`). It comes from the browser process, not a page, so page routes cannot see it. Playwright's own prefs already disable the obvious services. The app does not depend on it.
- The Scryfall Forest record is trimmed to the fields Webatrice reads, and it uses a fixture id. A spec that uses other cards needs a record under `e2e/fixtures/scryfall/`; the 404 message says so.
- Two orphaned `WebKitNetworkProcess.exe` processes from other agents' earlier runs (PIDs 8912 and 44044, started 16:44 and 16:59) are still running on the host. I left them alone.
- `e2e/` has no tsconfig and is not part of `npm run typecheck`. Adding one is a possible follow-up.
