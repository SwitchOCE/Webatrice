# feat(protocol): move to the Cockatrice 3.1 protocol with full Sockatrice command coverage

## Summary

- **Protocol bump.** `vendor/cockatrice` now points at Cockatrice master `add65ca` instead of 3.0.0 `63143f9`. Generated code is rebuilt. `PROTOCOL_VERSION` stays 14: it is unchanged in desktop `remote_client.cpp` and Servatrice `serversocketinterface.cpp`. Nothing in the existing code broke from renamed fields. The new fields that touch existing builders are handled: `AdjustMod.should_be_developer`, `DeckUpload.is_public` / `color_identity`, and the new `Response.RespPasswordChangeRequired`.
- **Every new command has a Sockatrice builder.** I listed them by diffing `libcockatrice_protocol` (63143f9..add65ca):
  - moderator 1010–1017 (card-art rules, GetUserSessions, GetUserAlts, GetModeratorLastLogins, RemoveUserAvatar)
  - moderator 1200–1205 (ReportList, ReportAssign, ReportResolve, ReplayDownloadByGameId, ReportUserInfo, ReportStats)
  - admin ResetUserPassword
  - a new **developer** command family (`ProtobufService.sendDeveloperCommand`, `request.developer`): GetServerStats, plus the `dev_ext` form of ViewLogHistory
  - session: Report, ReportMyList, ReportDetails, ReportAddComment, SetCardArtParams, and 8 deck-share / public-deck commands (1026–1033)
  - game: SetPlaymat

  Each builder has unit specs in the existing style. `integration/src/protocol-3.1.spec.ts` covers the round trips.
- **Events.** `Event_GameLogNotice` is registered. `UNDO_DRAW_FAILED` adds desktop's "X failed to undo their last draw." line to the game log, and unknown notice types are dropped as the proto requires. `REPORT_RESOLVED` and `REPORT_COMMENT` notify-user events already reach `server.notifications`; this is now covered by specs.
- **Login (PLAT-013, PLAT-003).** `RespPasswordChangeRequired` and `RespServerFull` are mapped. `loginFailed(responseCode)` passes the code into the optional `server.loginFailureCode`, and the login screen shows a translated message for both. For `RespPasswordChangeRequired` the message sends the user to Forgot Password and carries a "Reset password" button, because Servatrice refuses every login until the flag is cleared and only the forgot-password reset clears it before login (see notes). `clientver` is now `webatrice-<package version> (<last commit date>)`, the same shape as desktop's `VERSION_STRING`.
- **Support for older servers.** Datatrice adds `server.Selectors.supports(state, ServerCapability.X)`, which checks the `server_version` the server reports. This is the only signal available: Servatrice sends no feature list, and `protocol_version` is 14 on both 3.0 and 3.1. Each capability has its own minimum, down to the first `Development-3.1.0-beta.N` tag whose protocol carries it: card art beta.2; reports, moderation tools and playmats beta.8; developer role beta.12; deck sharing beta.13. A release (no label) outranks every beta. If the version can't be parsed, it answers `false`. This is documented in `datatrice.instructions.md#server-capabilities`.

## Parity rows closed
- PLAT-003 (client version identity)
- PLAT-013 (actionable login errors: server full, password change required)
- Protocol prerequisite for the "Mod/admin command coverage" gaps (CardArtRules, GetUserSessions/Alts, moderator last logins, ResetUserPassword, RemoveUserAvatar, report queue, Report/ReportMyList/ReportAddComment/ReportDetails, SetCardArtParams, SetPlaymat, REPORT_* notifications, Event_GameLogNotice). This PR only adds the transport and minimal state for these; the UI comes in later PRs.

## Desktop reference
- `libcockatrice_protocol/libcockatrice/protocol/pb/*` (diff 63143f9..add65ca); `featureset.cpp` has no feature changes
- `libcockatrice_network/.../abstract_client.cpp` `prepareDeveloperCommand`; `cockatrice/.../tab_supervisor.cpp` `openTabLog` and `tab_logs.cpp` (choice between the developer and moderator log families)
- `libcockatrice_network/.../remote_client.cpp` `generateCommandLogin` (clientver) and `cmake/getversion.cmake` (`VERSION_STRING` format)
- `cockatrice/.../remote_connection_controller.cpp` (RespPasswordChangeRequired / RespServerFull dialogs)
- `servatrice/src/servatrice_database_interface.cpp` `checkUserPassword` (PasswordChangeRequired only after a correct password), `serversocketinterface.cpp` `cmdAccountPassword` / `cmdForgotPasswordReset` (the two places that clear `force_password_change`), `server_protocolhandler.cpp` (no session commands before login)
- Cockatrice tags `2026-06-26-Development-3.1.0-beta` … `2026-10-02-Development-3.1.0-beta.16` and `cmake/getversion.cmake` (label format: `beta`, then `beta.N`); first tag carrying each feature's protos checked with `git ls-tree`
- `cockatrice/.../player_event_handler.cpp` `eventGameLogNotice`; `message_log_widget.cpp` `logUndoDrawFailed`
- `cockatrice/.../tab_supervisor.cpp` (REPORT_RESOLVED / REPORT_COMMENT popups)
- `servatrice/src/serversocketinterface.cpp`: dispatch tables, `cmdAdjustMod` (`has_should_be_*`), `cmdResetUserPassword`, `cmdSetCardArtParams` (rebroadcasts via Event_UserJoined), `initSession` (`server_version`)
- `cockatrice/.../dlg_report_user.cpp`, `dlg_my_reports.cpp`, `tab_report.cpp`, `tab_moderation.cpp` (response handling per command)

## Testing
All on the final tip `f1df593`.
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass. Also passes at every commit of the rewritten range (925942e … f1df593).
- `npm run lint`: 3/3 tasks pass (sockatrice, datatrice and webatrice clean; the base now carries PR 01's lint fixes).
- `npm test`: sockatrice 734 tests (39 files), datatrice 1148 (27), webatrice 1176 passed + 2 skipped (164 files; both skips already existed).
- `npm run test:integration`: sockatrice 153 (17 files), datatrice 124 (8), webatrice 132 passed + 2 skipped (35 files; both skips already existed). Sockatrice integration is also green at `c158cb6`, the commit that used to be red.
- `npm run test:e2e -w @cockatrice/sockatrice` against **3.0.0** (default pin): 4 files, 5 tests pass. The master-image run was not repeated in the fix round (no `webatrice-local/servatrice:master-add65ca` image in this environment); the fix round changed no wire format.
- Webatrice e2e not run: the only user-visible change in the fix round is the login status text and a button that opens an existing dialog; no server flow changed.

**Running e2e against Cockatrice master:** the shell value of `SERVATRICE_IMAGE` already overrides `--env-file .env.e2e` in compose. The compose `pull_policy` is now `missing` instead of `always`, so a local-only image is used rather than failing on a registry pull:
```
SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca npm run test:e2e -w @cockatrice/sockatrice
```

## Notes for reviewers
- **How responses are delivered.**
  - Results meant for a view go through new `IWebClientResponse` methods. They are all **optional** (`response.x.method?.(…)`), and so is the new `developer` scope, so third-party implementers keep compiling and Sockatrice ships as a minor. Datatrice doesn't implement them yet: storing reports, shares and moderation lookups belongs to the later PRs, as the brief asks.
  - One-shot dialog submissions (`report`, `reportAddComment`, `setCardArtParams`, `admin.resetUserPassword`) use `onSuccess` / `onFailure(code)` callbacks instead, like `replaySubmitCode`. The temporary password from a reset never enters the store.
  - Queries report a refusal through their scope's optional `commandFailed(command, responseCode, target)` on `ISessionResponse`, `IModeratorResponse` and `IDeveloperResponse` (names: the exported `SessionCommandName` / `ModeratorCommandName` / `DeveloperCommandName` unions). Datatrice turns them into the `sessionCommandFailed` / `moderatorCommandFailed` signals that views react to, the way desktop shows "Failed to load reports." This is the same shape the later staff PRs use; they add the transport `failure` argument and more command names.
  - All three rules are written up in `sockatrice.instructions.md`.
- **ResetUserPassword is admin-only.** Its moderator enum value (1016) exists, but `Command_ResetUserPassword` extends only `AdminCommand`, and Servatrice only handles it in `processExtendedAdminCommand`. Desktop's `TabModeration` sends it through `prepareModeratorCommand`, which looks like a desktop bug. So there is just `admin.resetUserPassword`.
- **Developer log lookups.** These use `Command_ViewLogHistory.dev_ext` and go to the existing `moderator.viewLogs`, matching desktop's `TabLog`. When to use the developer family instead of the moderator one (developer bit set, moderator bit not set) is a UI decision; `server.Selectors.getIsUserDeveloper` was added for it.
- **adjustMod fix (beyond scope).** The reducer now leaves a role alone when its flag is omitted, as Servatrice does. Before, `PlayerList`'s "promote to moderator" (judge flag undefined) cleared the judge bit locally. The new developer flag is handled the same way.
- **SetCardArtParams has no response handler.** Servatrice rebroadcasts the user's `ServerInfo_User` through `Event_UserJoined`, so the change reaches `server.users` through the existing handler.
- **Capability check is by version, per beta.** The 3.1 betas share `protocol_version` 14, so the pre-release label is the only way to tell a beta.7 server (no reports) from a beta.8 one. Labels compare like semver (`beta` < `beta.2` < `beta.10`). An untagged source build (like the master e2e image) reports `3.1.0 ()` with no label, so it counts as the release and supports everything, which matches its protocol.
- **Desktop's password-change text is a dead end.** Desktop says to log in with the temporary password and change it under Account → Change Password. Servatrice returns RespPasswordChangeRequired only after the password check passes and rejects the login, and `Command_AccountPassword` needs an authenticated session, so that advice can't work. The only pre-login path that clears `force_password_change` is the forgot-password reset. Webatrice points there instead of mirroring desktop's text.
- **`i18n-default.json` key order.** The pre-commit hook regenerates it, and `readdirSync` order differs on this filesystem, so the first rewritten commit reorders some keys. The content is identical (checked by comparing the parsed JSON).
- **Left for later PRs:** report, moderation, deck-share and playmat state and UI; rendering `server.notifications`; gating existing UI on `supports(...)`.

## Review response (rv1, PR 03)
- **Per-beta capability minimums (major):** fixed in `b4dcce3`. `ServerVersion` keeps the pre-release label; `MIN_SERVER_VERSION` uses the first beta tag for each capability (verified against the Cockatrice tags: card art beta.2, reports / moderation tools / playmats beta.8, developer role beta.12, deck sharing beta.13). Card art is credited to #6981.
- **Beta specs (major):** added cases for the first beta, beta.7, beta.11, beta.12, beta.15 and the 3.1.0 release, plus numeric ordering (`beta.2` vs `beta.10`). 10 of them fail on the old gate.
- **PasswordChangeRequired text (major):** fixed in `4682fcf`. The text sends the user to Forgot Password, and the status line carries a "Reset password" button that opens the Request Password Reset dialog. Desktop's text bug is noted above.
- **Query failure reporting (major):** fixed in `1843a51`, following the orchestrator's call (inbox M1). All 25 query builders route a refusal to the scope's optional `commandFailed(command, responseCode, target)`, and Datatrice dispatches `sessionCommandFailed` / `moderatorCommandFailed`. There is no Datatrice developer impl yet, so developer failures stop at the Sockatrice contract. `queryFailure.spec.ts` drives the real `handleResponse` for every builder, including with `commandFailed` or the `developer` scope missing (this also covers the review's minor about the always-defined mocks for these builders). There is one integration round trip.
- **Red intermediate commits (major):** `f24ddd9` is folded into the sockatrice commit (now `c158cb6`), and the `storeFixtures` line moved into the datatrice commit (now `ae5a355`). Typecheck passes at every commit.
- **Required `loginFailureCode` (major):** now `loginFailureCode?: number | null` in the commit that introduced it. The selector already reads it with `?? null`.
- Not addressed in this round (minors and nits not listed in the fix task): e2e image recipe, the seven can't-fail "does not call X" tests, 3.0 drift of the developer flag and `deckUpload` fields, the clientver length cap, and `reportResolve` sending `''`.

## Restack notes (wR1)

- Failure pattern (series decision): this PR introduces the one scope-level `commandFailed(command, responseCode, target)` + Datatrice `<scope>CommandFailed` signals. #04 adds the optional 4th `failure` (moderator/admin), #13 extends it to admin/developer and the staff lookups, #14 adds `failure?` to the session scope and routes the report builders through it — one implementation across all four scopes in the final stack.
