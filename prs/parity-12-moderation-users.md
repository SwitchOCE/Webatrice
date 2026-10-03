# feat(moderation): desktop's moderator/admin user actions everywhere, warn list, replay grant, force activate, log search

## Summary
- **Moderator section on every user context menu.** New `feature-widgets/moderation` ports the moderator/admin block of desktop's `UserContextMenu`: warn user, warn history, ban from server, ban history, view admin notes, and for admins Promote/Demote moderator, judge and, on 3.1 servers (`ServerCapability.DEVELOPER_ROLE`), developer (`should_be_developer`). Gating matches desktop: moderators (admins also carry IsModerator) see the section, admins also see one entry per role (moderator, judge, and developer on 3.1 servers: Demote if the target already has the role, Promote if the target is registered), and every entry is visible but disabled when the target is you. It now appears in room/server user lists and chat author names (through a `UserMenuSlot` that `UserActionsMenu` exposes, because components can't import feature-widgets), on the Player page, and in the game player list. The game's own warn/ban/history/notes modals are deleted.
- **Desktop round trips and dialogs.** Warn runs `GetUserInfo → GetWarnList(name, clientid) → WarningDialog`, so the reason is picked from the server's official warnings instead of typed freely. A reason with a starting intervention level above 1 is labelled "<reason> (IL n)", as `WarningDialog::addWarningOption` does. A missing `warning_il` counts as 1, so 3.0 servers show plain reasons. Ban runs `GetUserInfo → BanDialog`, pre-filled with name, IP and client id (client id unticked when empty; if GetUserInfo fails, only the name, since desktop opens the dialog whatever the code), permanent or temporary (default 5 min, d/h/m ranges as desktop), with desktop's validation messages. "Redact all messages" sends `remove_messages = -1` (0xFFFFFFFF on the wire), as desktop does. Histories show desktop's columns, or "User has never been warned/banned." Admin Notes has "Update Notes" disabled until you edit. Role changes and failed lookups show desktop's success/failure boxes. The Player page used to send a warn with an empty reason and a **permanent ban with no dialog**; it now uses the same flow.
- **Unused commands wired.** `getWarnList` feeds the warn dialog. `grantReplayAccess` and `forceActivateUser` get TabAdmin's "Server moderator functions" panel, with the response-code messages from `tab_admin.cpp`. A grant also re-reads the replay list, as desktop does. **forceActivateUser never reported success before**: Servatrice answers `RespActivationAccepted`, not `RespOk`.
- **LONG-006 log search.** Matches `TabLog`: Filters, Log Locations, Date Range (past X days ≤ 20 / today / last hour), Maximum Results (≤ 1000), Get User Logs / Clear Filters. A search with missing settings is completed and written back the way desktop does it: past 20 days, all locations, 1000 results. `date_range` goes out in hours (Servatrice uses `INTERVAL :range HOUR`). Before, it was never set, which means "no time limit". An empty result gives "There are no messages for the selected filters.", and a failed search gives desktop's failure message. Result tabs are labelled Room/Game/Chat Logs.
- **Transport and store.** Sockatrice adds an optional `commandFailed(command, responseCode, target)` to `IModeratorResponse`/`IAdminResponse`, wired from each command's `onError`. `getUserInfo` gains an `onError` that reports through the optional `ISessionResponse.getUserInfoFailed(userName, code)`. Datatrice adds `moderatorCommandFailed`/`adminCommandFailed`/`getUserInfoFailed` signals and `getWarnListForUser`, and exports `ServerCapability` from the package root (the `server` namespace's d.ts bundle keeps only its type). The `adjustMod` reducer, which already leaves an unset role flag alone (from the protocol branch), now also refreshes the user's profile snapshot.

## Parity rows closed
LONG-024, LONG-006 (plat-long-gaps.md). From the "Mod/admin command coverage" list: GetBanHistory, GetWarnHistory, Get/UpdateAdminNotes and AdjustMod are no longer PlayerList-only, and GetWarnList, GrantReplayAccess and ForceActivateUser now have UI.

## Desktop reference
- `cockatrice/src/interface/widgets/server/user/user_context_menu.cpp` (menu, gating, round trips, message boxes)
- `cockatrice/src/interface/widgets/server/user/user_list_dialog.cpp` (BanDialog, WarningDialog, AdminNotesDialog)
- `cockatrice/src/interface/widgets/tabs/tab_admin.cpp` (moderator functions, response-code messages)
- `cockatrice/src/interface/widgets/tabs/tab_logs.cpp` (log search)
- `servatrice/src/serversocketinterface.cpp` (cmdAdjustMod, cmdForceActivateUser, cmdGetWarnList), `servatrice_database_interface.cpp` (role bits, log range in hours)

## Testing
On the final tip `54287c0` (parent `parity/03-protocol`), after `git submodule update --init` and `npm ci`:
- `npx turbo run typecheck --concurrency=1`: 5/5 successful.
- `npm run lint`: 3/3 successful, 0 errors.
- `npm test -- -- --maxWorkers=2`:
  - sockatrice: 693 passed (38 files)
  - datatrice: 1140 passed (27 files)
  - webatrice: 1240 passed, 2 skipped (167 files + 2 skipped)
- `npm run test:integration -- -- --maxWorkers=2`:
  - sockatrice: 155 passed (17 files)
  - datatrice: 127 passed (8 files)
  - webatrice: 142 passed, 2 skipped (34 files + 2 skipped)
  - The webatrice suite includes `integration/src/features/moderation.spec.tsx`, which drives every round trip against the real WebClient.
- webatrice e2e, Servatrice 3.0.0, chromium + firefox + webkit, run in the `mcr.microsoft.com/playwright:v1.60.0-noble` container: 16 passed, 5 failed. `moderation-room-user.spec.ts` and `login-join-room.spec.ts` pass on all three browsers. The 5 failures are the known `ERR_CERT_AUTHORITY_INVALID` Scryfall cases from running in the container, which does not trust the egress proxy's CA: `app-boots` (chromium, webkit) and `bulk-card-actions` (all three). They are unrelated to this branch.
- New specs: `moderationMenu.spec.ts` (no developer entries on a 3.0 server), `ModerationProvider.spec.tsx` (menu gating by server version; warn and ban settling after a GetUserInfo failure; a failure for another user is ignored), the sockatrice `getUserInfo` failure case, and the datatrice `getUserInfoFailed` action and impl.

## Notes for reviewers
- **Placement of grant replay / force activate.** On desktop these live on the Administration tab, which Webatrice doesn't have yet (LONG-027, branch 13). The moderator-only Logs page hosts `<ModeratorFunctions />` for now; branch 13 should move it into the Administration route.
- **Admin lock.** Desktop only shows the moderator section while its Administration tab is open and unlocked. That tab opens unlocked for every moderator, so the user level is the gate here. Branch 13 can add the lock.
- **Rebased onto the 3.1 protocol branch (f24ddd9).** The protocol branch already made `adjustMod` leave omitted role flags alone and added `should_be_developer`. That single implementation is kept, and this branch only adds the `commandFailed` callbacks and the profile snapshot refresh. The developer role and the "(IL n)" suffix are added in a follow-up commit.
- **Still out of scope** (branches 13/14 and others): Report user, Investigate user, and Remove this user's messages / Show games / public decks. Logs-page access for developers without moderator rights (desktop: `tab_supervisor.cpp` + TabLog's developer command family, which hides IP and Private Chat) is not done; this page stays behind ModGuard.
- `getWarnList` sends the moderator's own name as `mod_name`. Desktop leaves it unset, and Servatrice ignores it either way. The sockatrice signature requires it, so I kept that rather than make an API change.
- Desktop's validation message boxes are shown inline in the form (same text, same order).
- `UserActionsMenu` now scrolls inside the viewport when the moderator entries make it taller. This is a small, additive change to a file branch 11 also touches.
- e2e seeds `e2e_moderator` (admin=2) and `e2e_superuser` (admin=1). It isn't called `e2e_admin` because the e2e ini's `disallowedwords="admin"` makes Servatrice refuse that login. `servatrice-e2e.ini` gains a plain-comma `officialwarnings`.

## Review response (rv2)
- **major: Promote/Demote developer offered on 3.0 servers** → fixed. `ModerationMenuInput.supportsDeveloperRole` is filled from `server.Selectors.supports(state, ServerCapability.DEVELOPER_ROLE)`, and the developer entry is skipped without it. There are builder and hook specs for a 3.0 admin. The earlier note that a 3.0 server "never triggers" the label was wrong: 3.0 answers RespOk and ignores the flag.
- **major: Warn/Ban hang when GetUserInfo fails** → fixed in the way desktop behaves. Desktop shows no error box here: `banUser_/warnUser_processUserInfoResponse` never check the code. So the flow goes to `ready`: Ban opens with only the name filled in, and Warn sends GetWarnList with an empty client id and then opens the warning dialog.
- The minor and nit findings (ModeratorCommandName naming, pendingRoleChanges key, log-search `searching` flag, admin e2e, `role="group"`, `create(...)` idiom, forceActivate comment, replay refetch placement, squashing `5462952`) were not in this fix task's scope and are left for a later pass.

