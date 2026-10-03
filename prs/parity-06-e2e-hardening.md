# test(e2e): make the browser e2e hermetic and fix the worker that never exits

> **Stacks on parity/13-administration** (`8fca043`: 01 lint → 02 hand reorder → 03 protocol → 12 moderation → 04 command outcomes → 10 account/auth → 11 rooms/chat/users → 13 administration). Review and merge after #13. Rebased from its original base, #04's `58b4116`.

## Summary
- **The browser e2e is hermetic now.** Specs import `test` from the new `e2e/fixtures/test.ts`. Every context it creates goes through `e2e/fixtures/network.ts`, which routes all non-localhost traffic:
  - Public game servers (the `DefaultHosts` WebSockets) are unreachable. The socket is closed before the server identifies itself.
  - **Desktop's public server list** (`https://cockatrice.github.io/public-servers.json`), which #10's host picker downloads the first time it opens, answers from `e2e/fixtures/public-servers.json`. The fixture has one reachable, one desktop-only (no WebSocket port) and one inactive entry, all on the reserved `.invalid` TLD. The response carries `Access-Control-Allow-Origin: *`, as GitHub Pages does. Every login flow opens the picker, so without this stub every spec would fail the unexpected-request check.
  - Scryfall answers from fixtures: a trimmed Forest card record, placeholder card images and mana symbols, and Scryfall's 404 error shape for anything else.
  - Google Fonts gets an empty stylesheet.
  - Any other external request is refused, and the test fails with the URL list.
- **The whole stack follows the rule.** All 10 specs import `test` from the fixture, including those from #10 (`account-self-service`), #11 (`user-games-and-private-chat`), #12 (`moderation-room-user`) and #13 (`staff-tools`). Their multi-client flows use the `newContext` fixture. Their `try`/`finally` and explicit context closes are removed, so a failed run keeps the page snapshot. The private-chat spec still closes the partner's context mid-test, because that is the disconnect under test; the fixture's close at teardown is then a no-op.
- **Root cause of `worker-N process did not exit within 300000ms`.** On Windows, WebKit's network process can outlive the browser while it still holds sockets to external hosts. It also inherits the browser's stdio pipes. Playwright's launcher waits for the browser's `close` event, which needs every pipe handle closed, so the worker waits until it is force-killed. With no external sockets there is nothing to wedge.
- **app-boots no longer depends on Chickatrice.** The login screen's automatic test-connection now gets a deterministic "unreachable".
- **Reliability fixes:**
  - `joinFirstRoom` tolerates Servatrice's auto-join landing after the Lobby is shown.
  - The `newContext` fixture closes multi-client contexts after the failure is recorded.
  - `vite preview` is never reused from a port another checkout may hold.
- **Lint covers `integration/` and `e2e/`** in every package's `lint` script. ESLint rejects Playwright's own `test` and `browser.newContext()` in `e2e/specs/`. The violations it found across the stack are fixed, including two over-long lines that #11 added (`datatrice/integration/src/sessionResponseToStore.spec.ts` and `webatrice/integration/src/features/server.spec.tsx`). Integration code is exempt from the layer rules, like specs.

## Parity rows closed
n/a. This is test infrastructure.

## Desktop reference
n/a. The public server fixture mirrors the shape of desktop's `PUBLIC_SERVERS_JSON` document (`handle_public_servers.cpp`).

## Testing
All run from the repo root on the tip, against Servatrice 3.0.0 (default image), with Vitest capped at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems. This includes integration and e2e.
- e2e files also typecheck with a temporary tsconfig over `e2e/` and `playwright.config.ts` (no errors).
- `npm test`:
  - sockatrice: 775 passed.
  - datatrice: 1196 passed.
  - webatrice: 1476 passed, 2 skipped (both pre-existing).
- `npm run test:integration`:
  - sockatrice: 166 passed.
  - datatrice: 136 passed.
  - webatrice: 160 passed, 2 skipped (pre-existing).
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests passed, exit 0.
- `npm run test:e2e -w @cockatrice/webatrice` (chromium + firefox + webkit, 12 tests × 3):
  - Run 1: **36/36 passed (8.6 min), Playwright exited 0**, no `did not exit`.
  - Run 2: **36/36 passed (8.4 min), Playwright exited 0**, no `did not exit`.
- `staff-tools`' alts lookup took its 3.0 branch (Moderation hidden). The 3.1-image e2e was not run for this branch.

## Notes for reviewers
- **No changeset.** Only test code, test fixtures, lint config and lint scripts change.
- **Commits.** The four commits from the original branch are kept. The stack-wide changes are folded into the commit each belongs to:
  - The public-server stub and the fixture imports go into "isolate the browser network".
  - The two max-len fixes go into "lint integration and e2e code".
  - The removal of `try`/`finally` and explicit closes from the #11 and #13 specs goes into "let the newContext fixture close multi-client contexts".
- **Rebase conflicts.** The only conflicts were import lists in `integration/src/websocket/rooms.spec.ts` and `users.spec.ts`. The upstream branches had added `Event_AddToList*`, `SessionCommands` and `Command_Message_ext` usages there. Those imports are kept, and the lint commit's reflowed imports are applied on top.
- The pre-commit hook regenerates `src/i18n-default.json` with a different key order (identical content). That churn is kept out of this branch.
- **Environment note.** The first webkit attempt in this container failed at `browserType.launch` (missing host libraries: libgtk-4 and others). Chromium and Firefox passed 24/24 in that attempt. After `npx playwright install-deps webkit`, the two runs above are the full results.
- **Carried over from the original PR:**
  - One unexplained webkit `selectHost` flake (about 1 in 100 login flows); it did not occur here.
  - Firefox keeps a browser-level connection to Mozilla's CDN that page routes cannot see.
  - `e2e/` has no tsconfig and is not part of `npm run typecheck`. Adding one is a possible follow-up.
