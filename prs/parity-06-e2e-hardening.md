# test(e2e): make the browser e2e hermetic and fix the worker that never exits

> **Stacks on parity/13-administration** (review-fixed tip `e2fb4b7`, pushed as `claude/parity-13-administration`: 01 lint → 02 hand reorder → 03 protocol → 12 moderation → 04 command outcomes → 10 account/auth → 11 rooms/chat/users → 13 administration). Review and merge after #13. Rebased from its original base, #04's `58b4116`.

## Summary
- **The browser e2e is hermetic now.** Specs import `test` from the new `e2e/fixtures/test.ts`. Every context it creates goes through `e2e/fixtures/network.ts`, which routes all non-localhost traffic:
  - Public game servers (the `DefaultHosts` WebSockets, and the stubbed public list's entries) are unreachable. The socket is closed before the server identifies itself. A socket to any other external host is closed and reported.
  - **Desktop's public server list** (`https://cockatrice.github.io/public-servers.json`), which #10's host picker downloads the first time it opens, answers from `e2e/fixtures/public-servers.json`. The fixture has one reachable, one desktop-only (no WebSocket port) and one inactive entry, all on the reserved `.invalid` TLD. The response carries `Access-Control-Allow-Origin: *`, as GitHub Pages does. Every login flow opens the picker, so without this stub every spec would fail the unexpected-request check.
  - Scryfall answers from fixtures on the single-card routes the app reads (`/cards/named`, `/cards/<id>`, with or without `format=image`): a trimmed Forest card record or Scryfall's 404 error shape, and placeholder card images and mana symbols. Any other Scryfall endpoint (search, autocomplete, collection) is refused and reported, because a stand-in of the wrong shape would quietly change app behaviour.
  - Google Fonts gets an empty stylesheet.
  - Any other external request or socket is refused, and the test fails with the URL list.
- **The whole stack follows the rule.** All 10 specs import `test` from the fixture, including those from #10 (`account-self-service`), #11 (`user-games-and-private-chat`), #12 (`moderation-room-user`) and #13 (`staff-tools`). Their multi-client flows use the `newContext` fixture. Their `try`/`finally` and explicit context closes are removed, so a failed run keeps the page snapshot. The private-chat spec still closes the partner's context mid-test, because that is the disconnect under test; the fixture's close at teardown is then a no-op.
- **Root cause of `worker-N process did not exit within 300000ms`.** On Windows, WebKit's network process can outlive the browser while it still holds sockets to external hosts. It also inherits the browser's stdio pipes. Playwright's launcher waits for the browser's `close` event, which needs every pipe handle closed, so the worker waits until it is force-killed. With no external sockets there is nothing to wedge.
- **app-boots no longer depends on Chickatrice.** The login screen's automatic test-connection now gets a deterministic "unreachable".
- **Reliability fixes:**
  - **Auto-join no longer steals focus (fixed at the source).** The Firefox join flake was a real parity bug: the Server view navigated into a room on every successful join, so Servatrice's auto-join pulled a user out of the Lobby. Desktop auto-joins with `setCurrent = false` (`tab_server.cpp:109-111`, `TabSupervisor::addRoomTab`). Sockatrice now passes its existing per-join `userInitiated` flag to `IRoomResponse.joinRoom(roomInfo, userInitiated?)`, Datatrice carries it in the `rooms/joinRoom` payload, and `Server.tsx` navigates only for a join the user asked for. `joinFirstRoom` is back to a plain click on the row's Join/Open button, so the manual join path runs on every e2e login.
  - **Deck-image prefetch.** The stricter Scryfall check found the board prefetching `api.scryfall.com/cards/?format=image` for every deck card without a Scryfall id (a plain .cod). The prefetch now uses the same by-name URL `Card` falls back to.
  - The `newContext` fixture closes multi-client contexts after the failure is recorded.
  - `vite preview` is never reused from a port another checkout may hold.
- **Lint covers `integration/` and `e2e/`** in every package's `lint` script. ESLint rejects Playwright's own `test` and `browser.newContext()` in `e2e/specs/`. The violations it found across the stack are fixed, including two over-long lines that #11 added (`datatrice/integration/src/sessionResponseToStore.spec.ts` and `webatrice/integration/src/features/server.spec.tsx`). Integration code is exempt from the layer rules, like specs.

## Parity rows closed
n/a. This is test infrastructure.

## Desktop reference
n/a. The public server fixture mirrors the shape of desktop's `PUBLIC_SERVERS_JSON` document (`handle_public_servers.cpp`).

## Testing
All run from the repo root on the final tip `19a7954`, against Servatrice 3.0.0 (default image), Vitest with `--maxWorkers=2`, turbo with `--concurrency=1`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: clean (includes integration and e2e).
- `npm test`: sockatrice 777 / 39 files; datatrice 1197 / 29; webatrice 1495 (+2 skipped, pre-existing) / 201 files (+2 skipped). All pass.
- `npm run test:integration`: sockatrice 166 / 19; datatrice 136 / 9; webatrice 160 (+2 skipped, pre-existing) / 36 files (+2 skipped). All pass.
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests passed.
- `@cockatrice/webatrice` e2e, chromium + firefox + webkit (12 tests × 3), run in `mcr.microsoft.com/playwright:v1.60.0-noble` (this container's own Playwright browsers are an older build), with the docker CLI and socket mounted so `staff-tools` can seed SQL: **36/36 passed (9.6 min), exit 0**. `staff-tools`' alts lookup took its 3.0 branch.
- The previous run, before the prefetch fix, failed 9 tests (bulk-card-actions, game-create-and-play, spectator × 3 browsers) on the new unexpected-request check with `GET https://api.scryfall.com/cards/?format=image&version=large`; that is the check working. Its other 3 failures were `staff-tools` without a docker CLI in the container (environment).
- New behaviour tests, each red before its fix: Sockatrice `joinRoom` passes `userInitiated` (3 cases, plus the `rooms.spec` integration auto-join asserting `false`); Datatrice `RoomResponseImpl` carries it; `Server.spec` stays in the Lobby for an auto-join and enters the room for a user join; `deckCardImageUrl.spec` (2).

## Notes for reviewers
- **Changesets.** The review fixes change published packages: `sockatrice-auto-join-not-current` (patch), `datatrice-auto-join-not-current` (patch), `webatrice-auto-join-not-current` (patch) and `webatrice-deck-prefetch-by-name` (patch). `IRoomResponse.joinRoom`'s new argument is optional.
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
  - `e2e/` has no tsconfig and is not part of `npm run typecheck`. Adding one is a possible follow-up (#24 adds it).

## Review response (rv4)
- **Auto-join focus steal tolerated in the test** → fixed at its source (`fix(rooms): open an auto-joined room without switching to it`), then the retry is dropped (`test(e2e): join the first room directly now that auto-join keeps the Lobby`). This also answers the "manual Join path untested" and "tighter timeouts" findings: the flow clicks Join/Open on every run with the old 15 s wait.
- **"Fails loudly" not true for WebSockets and Scryfall** → made true (`test(e2e): report unknown sockets and unstubbed Scryfall endpoints`). Sockets to hosts outside `DefaultHosts` (imported from `src/utils/HostService`) and the public-list fixture are reported; Scryfall is stubbed only on the routes the app reads. The header comment is rewrapped (the reflow nit) and lists what is stubbed.
- The stricter check surfaced a real app request to `/cards/?format=image`; fixed in `fix(game): prefetch deck images by name when a row has no Scryfall id`.
- **Rebased onto the fixed #13** (`e2fb4b7`); no conflicts.
- Not addressed (minor/nit, outside this task's list): teardown `Promise.allSettled`, the lint bypasses and `e2e/**` scope, the testing-instructions section, commit-1 message hygiene, linting `playwright.config.ts`, `rules-of-hooks` scope, `PUBLIC_SERVERS_URL` duplication, `readdirSync` for Scryfall fixtures, `bulk-card-actions` using `page`.

## Restack notes (wR1)

- 06 @d2f93e0 webatrice package.json lint script: 06's integration+e2e globs plus the lower branch's --max-warnings 0
