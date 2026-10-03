# feat: report users, My Reports and the moderator report queue (Cockatrice #7091)

> **Stacks on parity/15-replays** (`0d1d235`, itself on #06 `d2e3d1e`). Review and merge after #15.

## Summary

- **Report a user** (desktop `DlgReportUser`). `useReportUser().openReportUser({ userName, gameId?, chatContext? })` opens one app-wide dialog: reported user, the game (fixed when opened from a game, otherwise an optional field), the seven whitelisted categories with desktop's labels and tooltips, a required description, and the read-only chat log. Submitting asks "Submit report against X for Y?" and then sends `Command_Report` once. The button stays disabled until the server answers. Desktop's messages are shown for the daily limit, for an unknown or guest user, and for any other failure.
- **"Report user" in every user context menu.** `UserActionsMenu` (#12's shared menu, used by room/server user lists and chat author names) lists it after the buddy and ignore entries and before the slot (Show games, the moderator section), as desktop's `UserContextMenu` does: visible when the server takes reports and you are registered, disabled on your own name. The game player list and the player page have it too.
- **Chat context works like desktop.** Desktop attaches the context menu's game and `ChatView::getRecentChatLog(50)`. Here, a chat or game surface wraps itself in `ReportChatScope`, so any report opened inside it attaches the same context, including reports opened from the shared user menu. Room chat and the game chat log are wrapped this way. Game chat lines keep the sender name captured on arrival (`GameMessage.senderName`, as desktop's ChatView stores it), so a player who has since left stays in the attached log. `formatChatContext` keeps only user lines (no empty sender, no "Servatrice"), keeps the newest 50, and formats each as `[hh:mm:ss] user: message` with the local arrival time.
- **My Reports** (`/my-reports`, desktop `DlgMyReports`). You can open it from the user menu and from the Account page. It shows your reports with status colours, the description and resolution note, the chat log, and the comment thread. You can reply while a report is open or assigned. A `REPORT_RESOLVED` / `REPORT_COMMENT` notice pops up (desktop `processNotifyUserEvent`: server title + content, skipped if either is blank) and refreshes the open report views.
- **Report Queue** (`/report-queue`, desktop `TabReport`, moderators only):
  - list: the unresolved-only server query, local search and status filters, sortable columns, desktop's status tally
  - actions: assign to me, resolve, resolve with note, dismiss with note, comments as staff (`[Reporter]` / `[Moderator]` prefixes)
  - context: the reported user's history (`ReportUserInfo`, with a link to their profile page) and the statistics panel
  - keyboard: the report lists are `role="grid"` with one roving tab stop; ↑/↓/Home/End move the selection, Space/Enter select, and the sorted header carries `aria-sort`
  - refresh: every 5 minutes while visible, and after each mutation
  - **Join Game**: spectates the reported game, joining its room first like `IntentJoinServerGame`; join errors use the shared `rooms.joinGameError`
  - **View Replay**: fetches the game's replay with `ReplayDownloadByGameId` and opens it in #15's replay viewer (`/replay/:replayKey`, tab "Report game #N"), as desktop's `TabReport::viewReplayResponse` parses it and emits `openReplay`. Unparseable bytes show desktop's "Failed to parse replay."
- **Datatrice `server.reports`.** Normalized state: `mine` / `queue` id lists over shared `byId` rows, `details` (chat log + comments), `stats`, `replay`, `lastNotice` (a new object per notice; views compare by identity, which survives the slice reset on reconnect). Each has a selector. The reported user's history is #13's `server.staff` investigation (`getUserInvestigation(name).info`), not a second copy. Assign and resolve confirmations patch rows with fresh clones. `filterReports`, `countReportStatuses` and `isReportOpen` mirror TabReport.
- **Sockatrice.** The queue builders `reportList` / `reportAssign` / `reportResolve` / `reportStats` / `replayDownloadByGameId` report a failure through the moderator scope's optional `commandFailed` like every other staff command (`ModeratorCommandName` gains those names; the target is the report id, the game id, or empty for the list and stats). The session-scope reads `reportMyList` / `reportDetails` use the same shape through a new optional `session.commandFailed` (`SessionCommandName`), which Datatrice raises as `sessionCommandFailed`. Views show desktop's per-view failure line from those signals, and an assign or resolve completes (and refreshes the queue) on the `reportAssigned` / `reportResolved` signal for the report it sent. `replayDownloadByGameId` first calls the new optional `replayDownloadByGameIdPending`, which drops the stored replay. Everything is gated on `ServerCapability.REPORTS` / `MODERATION_TOOLS`, so 3.0 servers show nothing.

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
Final tip `60b3669` on `parity/15-replays` (`0d1d235`); `git submodule update --init`, `npm ci`. Vitest `--maxWorkers=2`, turbo `--concurrency=1`.
- `npx turbo run typecheck --concurrency=1`: pass on the tip **and on every one of the 23 commits** (checked one by one).
- `npm run lint`: 3/3 packages, 0 problems.
- `npm test`:
  - sockatrice: 792 passed (39 files)
  - datatrice: 1247 passed (33 files)
  - webatrice: 1667 passed + 2 skipped (223 files + 2 skipped; both skips pre-existing)
- `npm run test:integration`:
  - sockatrice: 166 passed (19 files)
  - datatrice: 138 passed (10 files)
  - webatrice: 179 passed + 2 skipped (40 files + 2 skipped; pre-existing)
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests passed.
- Webatrice e2e on the host:
  - **Pinned 3.0.0 image, full suite:** chromium + firefox 28 passed, 4 skipped. WebKit (after `npx playwright install-deps webkit`) 14 passed, 2 skipped. The skips are `reports.spec.ts`'s two 3.1-only tests.
  - **`webatrice-local/servatrice:master-add65ca` (3.1), `reports.spec.ts`:** 6 passed and 3 skipped (the 3.0-only test) across chromium, firefox and webkit.

## Review response (rv5)
Majors:
- **Report notices lost after a reconnect** → fixed (`fix(reports): pop up report notices again after a reconnect`). `lastNotice` is a new object per notice and has no counter. ReportNotifier, My Reports and the queue compare it by identity, which cannot repeat across the slice reset. New spec: notice → `disconnected` → notice gives two toasts.
- **Departed players vanish from the attached game chat** → fixed. `gameSay` stores `senderName` on the message at receipt (desktop ChatView). `gameChatContext` and the log read it. The spec that locked the bug in is flipped, and a reducer spec covers say → `playerLeft`.
- **Moderator commands sent by non-moderators** → fixed with #13's pattern. `ModGuard`, `CapabilityGuard` and `DeveloperGuard` take children (the files are identical to `claude/parity-13-administration`, so the restack dedupes them). The queue body mounts inside `ModGuard` → `CapabilityGuard(MODERATION_TOOLS)`, and My Reports inside `CapabilityGuard(REPORTS)`. The gating spec asserts `reportList` / `reportStats` were never called.
- **Instruction rewrite / per-call callbacks** → fixed per the series decision.
  - The five queue builders report failure through `moderator.commandFailed`, and `reportMyList` / `reportDetails` through a new optional `session.commandFailed` → `sessionCommandFailed`.
  - Every view failure line reads the Datatrice signal for its command and target. Assign and resolve complete on the `reportAssigned` / `reportResolved` signal for the report they sent.
  - `sockatrice.instructions.md` is back to #13's wording plus one sentence on the session-scope reads.
  - The original sockatrice commit still adds the callbacks. The conversion is a separate commit on top, so the restack can squash it if wanted.
- **Queue rows not keyboard-selectable** → fixed. #15's fix branch adds `useGridRows` to `@app/hooks`; it is not in this base, so it is copied byte for byte with its spec, and the restack should keep one copy.
  - `ReportTable` is `role="grid"` with a roving tab stop: ↑/↓/Home/End move the selection, and Space/Enter select. Desktop's table has no activate action.
  - The sorted `<th>` carries `aria-sort`.
- **Stale replay bytes on a second download** → fixed.
  - `replayDownloadByGameId` first calls the new optional `replayDownloadByGameIdPending`, and Datatrice clears `reports.replay` on it.
  - The queue opens the replay on the `REPORT_REPLAY_DOWNLOADED` arrival for the game it asked for, never from what the store already holds. A failure matches by game-id target.

Minors and nits:
- **Duplicated `saveReplayFile` blob helper** → no longer applies. The file was deleted when View Replay switched to the replay viewer.
- **"Report user" hard-coded in the player list menu** → now `t('ReportUserDialog.menuItem')`.
- **Unused i18n keys** → `Reports.unsupported` and `Reports.userContext.openProfile` are removed.
- **`report-queue` TabType** → the Report Queue joins `STAFF_TABS`.
- **Ad-hoc capability gating** → both pages use `CapabilityGuard`.
- **`useJoinReportGame`** → a room-join failure drops the pending spectate. Only the requested game id navigates. Both have specs.
- **Red intermediate commits** → folded:
  - the replay-bytes Datatrice fix from the test commit into the Datatrice commit
  - the datatrice `store/index.ts` export and the instructions note from the dialog commit into it
  - each changeset into its package's commit
  - two more red commits found by the per-commit typecheck: `storeFixtures` gained `reports` only in the dialog commit, and a `JSX.Element` → `ReactElement` fix landed one commit late. Both are now folded where they belong.
  - The commit messages are updated to match.
- **datatrice.instructions.md note on importing `ServerCapability` from the root** → kept, in the Datatrice commit. It documents why `ReportStatus` is exported flat, which this PR needs.
- **Nit: `getMessages` cast** → the selector's empty fallback is typed `GameMessage[]`. The casts in ChatLog and useGameLog are gone.
- **Nit: `<label htmlFor>` on a span** → a fixed game id is labelled with `aria-labelledby`.
- **Nit: `SERVER_HAS_REPORTS` regex on the image tag** → not changed. The e2e harness only knows the image tag, and the 3.0 / master images are the only two it runs. Reading the version from identification would need a live connection before test selection.

## Notes for reviewers
- **Stack.** Stacks on #15 (01 → 02 → 03 → 12 → 04 → 10 → 11 → 13 → 06 → 15). Review and merge after #15.
- **Restack onto #15 (conflicts, all additive, both sides kept one entry per line):** `SessionResponseImpl` (`replayListFailed` + `reportMyList`/`reportDetails`), `mockWebClient` (replay + report mocks), `AppShellRoutes`, `TopBar` (tab types, icons, `Film` + `Flag`), `TopBar.spec`, `tsconfig.json` and `vite.config.ts` aliases. `i18n-default.json` merged textually and was regenerated by `npm run translate`.
- **Rebase decisions (one owner per thing):**
  - **`reportUserInfo` belongs to #13.** `ModeratorResponseImpl.reportUserInfo` dispatches #13's `userInfoReport` into `server.staff.investigations[name].info`, and its failure is #13's `commandFailed('reportUserInfo', …)`. #14's `server.reports.userInfo`, `reportUserInfo` action/reducer, `getReportUserInfo` selector and the builder's `onFailure` parameter are removed. The queue's Reported User Context panel reads `getUserInvestigation(name)?.info` and shows its failure line on a `MODERATOR_COMMAND_FAILED` for `reportUserInfo` with that target. Opening the same user on the Moderation page and in the queue now shares one lookup.
  - **`ServerCapability`** keeps #13's single root export; #14 adds `ReportStatus` next to it.
  - **Menus.** My Reports and Report Queue are one-line entries in #13's `userMenuEntries.ts` (`requires: REPORTS` / `visibleTo: isModerator, requires: MODERATION_TOOLS`), with the Report Queue placed between Card Art Rules and Moderation as in desktop's Tabs menu. #14's own TopBar buttons and `TopBarReports` strings are gone; the labels live in `UserMenu.*`. The Report Queue's tab is one of the TopBar's `STAFF_TABS`, like the other moderator pages.
  - **Game player list.** #12 replaced the list's warn/ban/notes modals with the shared moderation widget. Only #14's "Report user" item (game id attached) is kept.
  - **E2E.** The report flow logs in as #12's `E2E_MODERATOR` (`e2e_moderator`); #14's `e2e_mod` seed and its duplicate `E2E_MODERATOR` export are dropped. `reports.spec.ts` imports `test` from `e2e/fixtures/test.ts` and opens its three clients with `newContext`, with no `try`/`finally`.
  - **`i18n-default.json`** is regenerated per commit, keeping the base file's key order so each commit only adds its own strings (no reorder churn).
- **Replay opens in the viewer, no download.** Desktop's report tab only has "View Replay" (parse → `openReplay` → replay tab); it has no save. So `saveReplayFile.ts` is deleted and the button, action and status strings follow desktop (`View Replay`, `Replay opened.`, `Failed to parse replay.`).
- **Shared seam.** #15's `useWatchReplay` (parse, `openReplay`, navigate to `/replay/:replayKey`) moved from `features/replays` to `@app/hooks`, so both features open replays through one hook without a feature-to-feature import. It got its own spec. The reports hook ignores a replay for a game other than the one it asked for (stale response), as it did before.
- **Private chat attaches no log.** `server.messages` stores `Event_UserMessage` with no arrival time, so the desktop `[hh:mm:ss]` format can't be built. The player page's "Report user" behaves like desktop's user-list menu: no chat log is attached.
- **Game id validation.** A typed game id that isn't a positive number is flagged in the form. Desktop silently drops it, which can detach a report from its game.
- **Join Game** opens only the game it asked for: a game joined elsewhere while the queue is open is not navigated to, and a failed room join drops the pending spectate. It overrides restrictions only for judges. This mirrors desktop's default admin-locked `canOverrideGameRestrictions()`. It does not prompt for a spectator password; a password-protected game shows the server's "Wrong password." through the shared join-error dialog.
- **The queue loads one page of 100**, as desktop does. When the server's `total_count` is larger, a "Showing the newest N of M" note is shown. Paging is not implemented.
- **Replay bytes travel bare.** `reportReplayDownloaded` carries `gameId` / `replayId` / bytes rather than the protobuf response, whose `bytes` field the dev `freezeMessagesMiddleware` can't freeze (like `replayDownloaded`). A spec checks this with the guard on. This lives in the Datatrice commit now; it used to be a fix inside a later test commit, which left that Datatrice commit red.
- **Labels.** "Report user" in the game player-list menu reads the shared `ReportUserDialog.menuItem` key, like every other entry point. The rest of that file's labels are pre-existing hardcoded English and are left alone.
- **Ordering in the shared menu.** Webatrice's `UserActionsMenu` already lists Show games in its slot after buddy/ignore (desktop puts it near the top), so "Report user" sits after Ignore and before Show games. Relative to buddy/ignore and the moderator section it matches desktop.
