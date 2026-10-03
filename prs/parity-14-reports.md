# feat: report users, My Reports and the moderator report queue (Cockatrice #7091)

> **Stacks on parity/06-e2e-hardening** (`d2e3d1e`). Review and merge after #06.

## Summary

- **Report a user** (desktop `DlgReportUser`). `useReportUser().openReportUser({ userName, gameId?, chatContext? })` opens one app-wide dialog: reported user, the game (fixed when opened from a game, otherwise an optional field), the seven whitelisted categories with desktop's labels and tooltips, a required description, and the read-only chat log. Submitting asks "Submit report against X for Y?" and then sends `Command_Report` once. The button stays disabled until the server answers. Desktop's messages are shown for the daily limit, for an unknown or guest user, and for any other failure.
- **"Report user" in every user context menu.** `UserActionsMenu` (#12's shared menu, used by room/server user lists and chat author names) lists it after the buddy and ignore entries and before the slot (Show games, the moderator section), as desktop's `UserContextMenu` does: visible when the server takes reports and you are registered, disabled on your own name. The game player list and the player page have it too.
- **Chat context works like desktop.** Desktop attaches the context menu's game and `ChatView::getRecentChatLog(50)`. Here, a chat or game surface wraps itself in `ReportChatScope`, so any report opened inside it attaches the same context, including reports opened from the shared user menu. Room chat and the game chat log are wrapped this way. `formatChatContext` keeps only user lines (no empty sender, no "Servatrice"), keeps the newest 50, and formats each as `[hh:mm:ss] user: message` with the local arrival time.
- **My Reports** (`/my-reports`, desktop `DlgMyReports`). You can open it from the user menu and from the Account page. It shows your reports with status colours, the description and resolution note, the chat log, and the comment thread. You can reply while a report is open or assigned. A `REPORT_RESOLVED` / `REPORT_COMMENT` notice pops up (desktop `processNotifyUserEvent`: server title + content, skipped if either is blank) and refreshes the open report views.
- **Report Queue** (`/report-queue`, desktop `TabReport`, moderators only):
  - list: the unresolved-only server query, local search and status filters, sortable columns, desktop's status tally
  - actions: assign to me, resolve, resolve with note, dismiss with note, comments as staff (`[Reporter]` / `[Moderator]` prefixes)
  - context: the reported user's history (`ReportUserInfo`, with a link to their profile page) and the statistics panel
  - refresh: every 5 minutes while visible, and after each mutation
  - **Join Game**: spectates the reported game, joining its room first like `IntentJoinServerGame`; join errors use the shared `rooms.joinGameError`
  - **Download Replay**: saves the bytes from `ReplayDownloadByGameId` as a `.cor` file
- **Datatrice `server.reports`.** Normalized state: `mine` / `queue` id lists over shared `byId` rows, `details` (chat log + comments), `stats`, `replay`, `lastNotice`. Each has a selector. The reported user's history is #13's `server.staff` investigation (`getUserInvestigation(name).info`), not a second copy. Assign and resolve confirmations patch rows with fresh clones. `filterReports`, `countReportStatuses` and `isReportOpen` mirror TabReport.
- **Sockatrice.** The report reads and the queue builders (except `reportUserInfo`, see below) now take a trailing `onFailure(responseCode)`, and `reportAssign` / `reportResolve` also take a completion callback. Desktop shows a failure line per view and refreshes after mutations; until now, failures only reached `console.error`. Everything is gated on `ServerCapability.REPORTS` / `MODERATION_TOOLS`, so 3.0 servers show nothing.

## Parity rows closed
- LONG-023 (report a user and track own reports)
- LONG-025 (report review and case management)

## Desktop reference
- `cockatrice/src/interface/widgets/dialogs/dlg_report_user.cpp`, `dlg_my_reports.cpp`
- `cockatrice/src/interface/widgets/tabs/tab_report.cpp`, `tab_account.cpp` (My Reports button), `tab_supervisor.cpp` (`openTabReport`, `joinReportGame`, `REPORT_RESOLVED` / `REPORT_COMMENT` popups, moderator-only menu)
- `cockatrice/src/interface/widgets/utility/report_utils.cpp` (category/time formatting, status colours, comment rendering)
- `cockatrice/src/interface/widgets/server/chat_view/chat_view.cpp` (`getRecentChatLog`), `server/user/user_context_menu.cpp` (report action, gating)
- `libcockatrice_utility/.../report_categories.cpp` (category whitelist)
- `servatrice/src/serversocketinterface.cpp`: `cmdReport`, `cmdReportMyList`, `cmdReportDetails`, `cmdReportAddComment`, `cmdReportList`, `cmdReportAssign`, `cmdReportResolve`, `sendPendingReportNotifications` (status values, rate limits, `RespInvalidData` on stale assign/resolve/comment, who gets notified)
- Every file in `git show ed4eb1c --stat` that concerns reporting was checked.

## Testing
Rebased onto `parity/06-e2e-hardening` (`d2e3d1e`); `git submodule update --init` (servatrice `add65ca`), `npm ci`. All results from the final tree (`696bf8c`), Vitest `--maxWorkers=2`, turbo `--concurrency=1`.
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint` (src, integration, e2e): 3/3 packages, 0 problems.
- `npm test`:
  - sockatrice: 782 passed (39 files)
  - datatrice: 1234 passed (32 files)
  - webatrice: 1562 passed + 2 skipped (211 files + 2 skipped; both skips pre-existing)
- `npm run test:integration`:
  - sockatrice: 166 passed (19 files)
  - datatrice: 138 passed (10 files)
  - webatrice: 169 passed + 2 skipped (38 files + 2 skipped; pre-existing)
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests passed.
- Webatrice e2e, browsers in `mcr.microsoft.com/playwright:v1.60.0-noble` (the host has no matching Firefox/WebKit), after `npm run build` + `test:e2e:up`:
  - **Pinned 3.0.0 image, full suite** (14 tests × chromium/firefox/webkit = 42): 39 passed, 3 skipped. The skips are `reports.spec.ts`'s 3.1-only flow. `staff-tools`' admin test first failed in all three browsers with `spawnSync docker ENOENT`: that spec runs SQL through `docker compose exec`, and the Playwright container has no docker CLI. Re-run with the host's docker CLI, compose plugin and socket mounted into the container: `staff-tools.spec.ts` 6/6 passed. Environment only, not a code failure.
  - **`webatrice-local/servatrice:master-add65ca` (3.1)**, `reports.spec.ts` + `staff-tools.spec.ts` + `moderation-room-user.spec.ts`: 12 passed, 3 skipped (the 3.0-only "no report entry points" test). The full report flow (reporter → moderator queue → comment → resolve with note → notice → My Reports) passed in chromium, firefox and webkit.

## Notes for reviewers
- **Stack.** Stacks on #06 (01 → 02 → 03 → 12 → 04 → 10 → 11 → 13 → 06). Review and merge after #06.
- **Rebase decisions (one owner per thing):**
  - **`reportUserInfo` belongs to #13.** `ModeratorResponseImpl.reportUserInfo` dispatches #13's `userInfoReport` into `server.staff.investigations[name].info`, and its failure is #13's `commandFailed('reportUserInfo', …)`. #14's `server.reports.userInfo`, `reportUserInfo` action/reducer, `getReportUserInfo` selector and the builder's `onFailure` parameter are removed. The queue's Reported User Context panel reads `getUserInvestigation(name)?.info` and shows its failure line on a `MODERATOR_COMMAND_FAILED` for `reportUserInfo` with that target. Opening the same user on the Moderation page and in the queue now shares one lookup.
  - **`ServerCapability`** keeps #13's single root export; #14 adds `ReportStatus` next to it.
  - **Menus.** My Reports and Report Queue are one-line entries in #13's `userMenuEntries.ts` (`requires: REPORTS` / `visibleTo: isModerator, requires: MODERATION_TOOLS`), with the Report Queue placed between Card Art Rules and Moderation as in desktop's Tabs menu. #14's own TopBar buttons and `TopBarReports` strings are gone; the labels live in `UserMenu.*`. The TopBar keeps the transient tab titles.
  - **Game player list.** #12 replaced the list's warn/ban/notes modals with the shared moderation widget. Only #14's "Report user" item (game id attached) is kept.
  - **E2E.** The report flow logs in as #12's `E2E_MODERATOR` (`e2e_moderator`); #14's `e2e_mod` seed and its duplicate `E2E_MODERATOR` export are dropped. `reports.spec.ts` imports `test` from `e2e/fixtures/test.ts` and opens its three clients with `newContext`, with no `try`/`finally`.
  - **`i18n-default.json`** is regenerated per commit, keeping the base file's key order so each commit only adds its own strings (no reorder churn).
- **Replay.** The queue's action stays "Download Replay" and saves a `.cor` file. `features/reports/saveReplayFile.ts`, called from one place in `useReportQueue`, is the seam #15 swaps for the viewer.
- **Private chat attaches no log.** `server.messages` stores `Event_UserMessage` with no arrival time, so the desktop `[hh:mm:ss]` format can't be built. The player page's "Report user" behaves like desktop's user-list menu: no chat log is attached.
- **Game id validation.** A typed game id that isn't a positive number is flagged in the form. Desktop silently drops it, which can detach a report from its game.
- **Join Game** overrides restrictions only for judges. This mirrors desktop's default admin-locked `canOverrideGameRestrictions()`. It does not prompt for a spectator password; a password-protected game shows the server's "Wrong password." through the shared join-error dialog.
- **The queue loads one page of 100**, as desktop does. When the server's `total_count` is larger, a "Showing the newest N of M" note is shown. Paging is not implemented.
- **Replay download bug found and fixed.** `reportReplayDownloaded` first carried the protobuf response, whose `bytes` field the dev `freezeMessagesMiddleware` can't freeze. The bytes now travel bare, like `replayDownloaded`, and a spec checks this with the guard on.
- **Hardcoded labels.** The game player-list menu labels are hardcoded English throughout that file, so "Report user" follows that convention there. All other new strings, including the shared user menu's entry, are in `*.i18n.json`.
- **Ordering in the shared menu.** Webatrice's `UserActionsMenu` already lists Show games in its slot after buddy/ignore (desktop puts it near the top), so "Report user" sits after Ignore and before Show games. Relative to buddy/ignore and the moderator section it matches desktop.
