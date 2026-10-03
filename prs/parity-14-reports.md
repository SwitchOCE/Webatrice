# feat: report users, My Reports and the moderator report queue (Cockatrice #7091)

## Summary

- **Report a user** (desktop `DlgReportUser`). `useReportUser().openReportUser({ userName, gameId?, chatContext? })` opens one app-wide dialog: reported user, the game (fixed when opened from a game, otherwise an optional field), the seven whitelisted categories with desktop's labels and tooltips, a required description, and the read-only chat log. Submitting asks "Submit report against X for Y?" and then sends `Command_Report` once. The button stays disabled until the server answers. Desktop's messages are shown for the daily limit, for an unknown or guest user, and for any other failure.
- **Chat context works like desktop.** Desktop attaches the context menu's game and `ChatView::getRecentChatLog(50)`. Here, a chat or game surface wraps itself in `ReportChatScope`, so any report opened inside it attaches the same context, including reports opened from the shared user menu. Room chat and the game chat log are wrapped this way. `formatChatContext` keeps only user lines (no empty sender, no "Servatrice"), keeps the newest 50, and formats each as `[hh:mm:ss] user: message` with the local arrival time.
- **My Reports** (`/my-reports`, desktop `DlgMyReports`). You can open it from the user menu and from the Account page. It shows your reports with status colours, the description and resolution note, the chat log, and the comment thread. You can reply while a report is open or assigned. A `REPORT_RESOLVED` / `REPORT_COMMENT` notice pops up (desktop `processNotifyUserEvent`: server title + content, skipped if either is blank) and refreshes the open report views.
- **Report Queue** (`/report-queue`, desktop `TabReport`, moderators only):
  - list: the unresolved-only server query, local search and status filters, sortable columns, desktop's status tally
  - actions: assign to me, resolve, resolve with note, dismiss with note, comments as staff (`[Reporter]` / `[Moderator]` prefixes)
  - context: the reported user's history (`ReportUserInfo`, with a link to their profile page) and the statistics panel
  - refresh: every 5 minutes while visible, and after each mutation
  - **Join Game**: spectates the reported game, joining its room first like `IntentJoinServerGame`; join errors use the shared `rooms.joinGameError`
  - **Download Replay**: saves the bytes from `ReplayDownloadByGameId` as a `.cor` file
- **Datatrice `server.reports`.** Normalized state: `mine` / `queue` id lists over shared `byId` rows, `details` (chat log + comments), `userInfo`, `stats`, `replay`, `lastNotice`. Each has a selector. Assign and resolve confirmations patch rows with fresh clones. `filterReports`, `countReportStatuses` and `isReportOpen` mirror TabReport.
- **Sockatrice.** The report reads and the queue builders now take a trailing `onFailure(responseCode)`, and `reportAssign` / `reportResolve` also take a completion callback. Desktop shows a failure line per view and refreshes after mutations; until now, failures only reached `console.error`. Everything is gated on `ServerCapability.REPORTS` / `MODERATION_TOOLS`, so 3.0 servers show nothing.

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
All results are from the final tree. Vitest ran with `--maxWorkers=2` because of the shared-host memory limit.
- `npm run typecheck`: 5/5 tasks pass.
- `npm run lint`: the turbo run OOM-crashed on the shared host, so each package was run on its own with `eslint src`. sockatrice, datatrice and webatrice all report 0 problems.
- `npm test` (per package):
  - sockatrice: 690 passed (38 files)
  - datatrice: 1171 passed (30 files)
  - webatrice: 1251 passed + 2 skipped (173 files + 2 skipped). Both skips already existed.
- `npm run test:integration` (per package):
  - sockatrice: 152 passed (17 files)
  - datatrice: 126 passed (9 files)
  - webatrice: 141 passed + 2 skipped (35 files + 2 skipped). Both skips already existed.
- New integration specs:
  - `webatrice/integration/src/websocket/reports.spec.ts`: wire bytes for every report command, including a lost assignment race
  - `webatrice/integration/src/features/reports.spec.tsx`: dialog → `Command_Report` → confirmation; My Reports list → details → comment → refresh, against a server that identifies as 3.1
  - `datatrice/integration/src/reportsToStore.spec.ts`
- E2E (`e2e/specs/reports.spec.ts`, run under the e2e mutex): 
  - `SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca`: 3 passed, 3 skipped (1.2m). The full report flow passed in chromium, firefox and webkit. The skipped test is the 3.0-only assertion.
  - Pinned `3.0.0` image: 3 passed, 3 skipped (58.5s). The "no report entry points" assertion passed in all three browsers. The skipped test is the 3.1-only flow.
  - Both runs were `npm run build`, then `test:e2e:up`, then `playwright test e2e/specs/reports.spec.ts`, then `test:e2e:down`, all under the e2e lock. The other e2e specs were not re-run, because this PR does not touch them.

## Notes for reviewers
- **Shared user context menu hookup (sibling PR owns `components/UserDisplay/UserActionsMenu.tsx`).** The one-line hookup is in `UserActionsMenu`: `const { canReportUser, openReportUser } = useReportUser();` (from `@app/dialogs`) plus a menu item, `{canReportUser(name) && <button … onClick={() => { openReportUser({ userName: name }); onClose(); }}>Report user</button>}`. Room-chat names (`Message.PlayerLink`) render inside `RoomChat`'s `ReportChatScope`, so those reports attach the room chat log automatically. User-list rows sit outside any scope and attach nothing, as on desktop.
- **Overlap with parity/13-administration.** That branch also stores `reportUserInfo` in Datatrice, under `server.staff`. This branch keeps it in `server.reports.userInfo` and implements `ModeratorResponseImpl.reportUserInfo` too. When the branches are rebased, one owner has to be chosen and the other selector repointed: the queue reads `server.Selectors.getReportUserInfo`.
- **Private chat attaches no log.** `server.messages` stores `Event_UserMessage` with no arrival time, so the desktop `[hh:mm:ss]` format can't be built. The player page's "Report user" behaves like desktop's user-list menu: no chat log is attached.
- **Replay.** Webatrice has no replay viewer, so the queue's replay action is labelled "Download Replay" and saves a `.cor` file that desktop opens. When a viewer lands, `saveReplayFile` in `useReportQueue` is the single place to swap.
- **Game id validation.** A typed game id that isn't a positive number is flagged in the form. Desktop silently drops it, which can detach a report from its game.
- **Join Game** overrides restrictions only for judges. This mirrors desktop's default admin-locked `canOverrideGameRestrictions()`. It does not prompt for a spectator password; a password-protected game shows the server's "Wrong password." through the shared join-error dialog.
- **The queue loads one page of 100**, as desktop does. When the server's `total_count` is larger, a "Showing the newest N of M" note is shown. Paging is not implemented.
- **Datatrice fix beyond scope.** tsup emits a const-and-type pair type-only inside the `server` namespace, so `server.ServerCapability.REPORTS` was `undefined` at runtime. `ServerCapability` and `ReportStatus` are now also exported from the package root. `datatrice.instructions.md` says to import from the root.
- **Replay download bug found and fixed.** `reportReplayDownloaded` first carried the protobuf response, whose `bytes` field the dev `freezeMessagesMiddleware` can't freeze. The bytes now travel bare, like `replayDownloaded`, and an integration spec checks this with the guard on.
- **E2E support.** The e2e DB seed (`docker/servatrice/judge-seed.sql`) now also seeds a moderator, `e2e_mod` (admin = 2, same password). The e2e spec reads the image tag and runs the full flow only on a 3.1 image. On the 3.0.0 pin it instead asserts that no report entry point is offered, so each image runs exactly one of the two tests.
- **Hardcoded labels.** The game player-list menu labels are hardcoded English throughout that file, so "Report user" follows that convention. All other new strings are in `*.i18n.json`.
