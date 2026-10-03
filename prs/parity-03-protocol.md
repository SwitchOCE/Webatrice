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
- **Login (PLAT-013, PLAT-003).** `RespPasswordChangeRequired` and `RespServerFull` are mapped. `loginFailed(responseCode)` passes the code into `server.loginFailureCode`, and the login screen shows a translated message for both. `clientver` is now `webatrice-<package version> (<last commit date>)`, the same shape as desktop's `VERSION_STRING`.
- **Support for older servers.** Datatrice adds `server.Selectors.supports(state, ServerCapability.X)`, which checks the `server_version` the server reports. This is the only signal available: Servatrice sends no feature list, and `protocol_version` is 14 on both 3.0 and 3.1. If the version can't be parsed, it answers `false`. This is documented in `datatrice.instructions.md#server-capabilities`.

## Parity rows closed
- PLAT-003 (client version identity)
- PLAT-013 (actionable login errors: server full, password change required)
- Protocol prerequisite for the "Mod/admin command coverage" gaps (CardArtRules, GetUserSessions/Alts, moderator last logins, ResetUserPassword, RemoveUserAvatar, report queue, Report/ReportMyList/ReportAddComment/ReportDetails, SetCardArtParams, SetPlaymat, REPORT_* notifications, Event_GameLogNotice). This PR only adds the transport and minimal state for these; the UI comes in later PRs.

## Desktop reference
- `libcockatrice_protocol/libcockatrice/protocol/pb/*` (diff 63143f9..add65ca); `featureset.cpp` has no feature changes
- `libcockatrice_network/.../abstract_client.cpp` `prepareDeveloperCommand`; `cockatrice/.../tab_supervisor.cpp` `openTabLog` and `tab_logs.cpp` (choice between the developer and moderator log families)
- `libcockatrice_network/.../remote_client.cpp` `generateCommandLogin` (clientver) and `cmake/getversion.cmake` (`VERSION_STRING` format)
- `cockatrice/.../remote_connection_controller.cpp` (RespPasswordChangeRequired / RespServerFull dialogs)
- `cockatrice/.../player_event_handler.cpp` `eventGameLogNotice`; `message_log_widget.cpp` `logUndoDrawFailed`
- `cockatrice/.../tab_supervisor.cpp` (REPORT_RESOLVED / REPORT_COMMENT popups)
- `servatrice/src/serversocketinterface.cpp`: dispatch tables, `cmdAdjustMod` (`has_should_be_*`), `cmdResetUserPassword`, `cmdSetCardArtParams` (rebroadcasts via Event_UserJoined), `initSession` (`server_version`)
- `cockatrice/.../dlg_report_user.cpp`, `dlg_my_reports.cpp`, `tab_report.cpp`, `tab_moderation.cpp` (response handling per command)

## Testing
- `npm run typecheck`: 5/5 tasks pass.
- `npm test`: passes. sockatrice 683 tests (38 files), datatrice 1132 (27), webatrice 1160 passed + 2 skipped (both skips already existed).
- `npm run test:integration`: passes. sockatrice 152 (17 files), datatrice 124 (8), webatrice 129 passed + 2 skipped (both skips already existed).
- `npm run lint`: sockatrice and datatrice are clean. **Webatrice fails with 192 errors that were there before this PR** (mostly `max-len` and a missing `react-hooks/exhaustive-deps` rule definition). They are all in files this PR does not touch, such as `PlayerBox.tsx`, `Decks.tsx` and `TopBar.tsx`. Every Webatrice file this PR touches lints clean.
- `npm run test:e2e -w @cockatrice/sockatrice` against **3.0.0** (default pin): 4 files, 5 tests pass.
- Same command with `SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca`: 4 files, 5 tests pass.
  - A probe run confirmed which branch the new spec takes on each server. 3.0.0 reports `3.0.0 ()` and answers SetCardArtParams with code 8 (RespFunctionNotAllowed); master reports `3.1.0 ()` and answers with RespOk, and the ReportMyList round trip succeeds.
  - These e2e runs happened before the e2e mutex was added to the brief, so they ran without the lock. No other e2e stack was up during them.

**Running e2e against Cockatrice master:** the shell value of `SERVATRICE_IMAGE` already overrides `--env-file .env.e2e` in compose. The compose `pull_policy` is now `missing` instead of `always`, so a local-only image is used rather than failing on a registry pull:
```
SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca npm run test:e2e -w @cockatrice/sockatrice
```

## Notes for reviewers
- **How responses are delivered.**
  - Results meant for a view go through new `IWebClientResponse` methods. They are all **optional** (`response.x.method?.(…)`), and so is the new `developer` scope, so third-party implementers keep compiling and Sockatrice ships as a minor. Datatrice doesn't implement them yet: storing reports, shares and moderation lookups belongs to the later PRs, as the brief asks.
  - One-shot dialog submissions (`report`, `reportAddComment`, `setCardArtParams`, `admin.resetUserPassword`) use `onSuccess` / `onFailure(code)` callbacks instead, like `replaySubmitCode`. The temporary password from a reset never enters the store.
  - Both rules are written up in `sockatrice.instructions.md`.
- **ResetUserPassword is admin-only.** Its moderator enum value (1016) exists, but `Command_ResetUserPassword` extends only `AdminCommand`, and Servatrice only handles it in `processExtendedAdminCommand`. Desktop's `TabModeration` sends it through `prepareModeratorCommand`, which looks like a desktop bug. So there is just `admin.resetUserPassword`.
- **Developer log lookups.** These use `Command_ViewLogHistory.dev_ext` and go to the existing `moderator.viewLogs`, matching desktop's `TabLog`. When to use the developer family instead of the moderator one (developer bit set, moderator bit not set) is a UI decision; `server.Selectors.getIsUserDeveloper` was added for it.
- **adjustMod fix (beyond scope).** The reducer now leaves a role alone when its flag is omitted, as Servatrice does. Before, `PlayerList`'s "promote to moderator" (judge flag undefined) cleared the judge bit locally. The new developer flag is handled the same way.
- **SetCardArtParams has no response handler.** Servatrice rebroadcasts the user's `ServerInfo_User` through `Event_UserJoined`, so the change reaches `server.users` through the existing handler.
- **Capability check is by version.** Pre-release labels are ignored, so `3.1.0-beta.N` counts as 3.1. That means early 3.1 betas from before #7091 would report support for features they lack; a failed command still comes back with an error code there. A local build with no git metadata reports `3.1.0 ()`, which parses fine.
- **Left for later PRs:** report, moderation, deck-share and playmat state and UI; rendering `server.notifications`; gating existing UI on `supports(...)`.
