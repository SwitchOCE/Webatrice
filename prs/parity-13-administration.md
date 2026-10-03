# feat(staff): Administration, Moderation, Card Art Rules and Developer pages

> **Stacks on parity/11-rooms-chat-users** (`a6642c3`, which sits on #10 account/auth → #04 command outcomes → #12 moderation → #03 3.1 protocol → #02 → #01). Review and merge after #11.

## Summary

- **Administration (LONG-027)** mirrors desktop `TabAdmin`:
  - update server message, shut down server (reason, and minutes from 0 to 999 with a default of 5), reload configuration
  - the "Server moderator functions": grant replay access, and force-activate a user
  - the Lock / Unlock safety toggle

  Gating follows desktop: moderators get the page and the moderator functions, and the "Server administration functions" group is enabled only for admins (desktop's `fullAdmin`). Result dialogs use desktop's text for each response code.
- **Moderation (LONG-026)** mirrors `TabModeration`, on 3.1 servers:
  - Investigate a user: `ReportUserInfo` (registered, last login, status, counts, admin notes), sessions and alts.
  - Staff last logins, with Refresh.
  - Reset password, for admins only. The temporary password lives only in the result dialog's React state and is dropped when the dialog closes.
  - Remove avatar. Both remediation actions ask for desktop's confirmation first.
- **Card Art Rules** mirrors `TabCardArtRules`: list, add, remove the selected rule, and refresh. The printing is picked from the local card database ("set long name #number", keyed by uuid); a typed provider id is accepted when the card isn't there.
- **Developer** mirrors `TabDeveloper`: server statistics, a per-command table sorted by total time, and auto-refresh (5 to 3600 s). Only developers see it.
- **User context menu.** #12's moderator section gains desktop's "Investigate user" (after "View admin notes", enabled for another user, on 3.1 servers), which opens the Moderation page on that user. Desktop's admin lock now hides the whole moderator section while the Administration page is locked, as `TabSupervisor::getAdminLocked` does.
- **One failure mechanism.**
  - Every staff command reports a failure through the scope's `commandFailed`, from #12, and carries #04's transport reason. That covers the staff lookups, avatar removal, the card-art list and the three server-administration commands. `getServerStats` gets a new optional `IDeveloperResponse.commandFailed`.
  - Datatrice turns these into `moderatorCommandFailed` / `adminCommandFailed` / `developerCommandFailed` signals, and the pages explain them with desktop's text, or with #04's timed-out / connection-lost reason through `useCommandFailureMessage`.
  - `resetUserPassword` keeps caller callbacks, because the secret must not reach the store. Its `onFailure` now also gets the transport reason.
- **Store.** Datatrice keeps the 3.1 staff results under `server.staff`: per-user investigations, staff logins, card-art rules and server stats, each with a selector. It also adds a `DeveloperResponseImpl`.

## Parity rows closed
- LONG-026: user investigation and remediation
- LONG-027: Administration (server message, shutdown, config reload, lock, activation, replay access)

## Desktop reference
- `cockatrice/src/interface/widgets/tabs/tab_admin.cpp` (ShutdownDialog, TabAdmin, response handling, `actLock` / `actUnlock`)
- `cockatrice/src/interface/widgets/tabs/tab_moderation.cpp` (columns, `formatEpoch`, status/counts strings, confirmations, reset/avatar results)
- `cockatrice/src/interface/widgets/tabs/tab_card_art_rules.cpp`
- `cockatrice/src/interface/widgets/tabs/tab_developer.cpp`
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp`: which roles get which tabs and in what order; `openTabModeration(userName)`; `getAdminLocked`
- `cockatrice/src/interface/widgets/server/user/user_context_menu.cpp`: the `aInvestigateUser` placement and enablement, and the `!getAdminLocked()` block
- `servatrice/src/serversocketinterface.cpp`: `cmdForceActivateUser` → `cmdActivateAccount`, `cmdGrantReplayAccess`, `cmdGetUserAlts`, `cmdResetUserPassword` (admin family only), `cmdUpdateServerMessage`
- `servatrice/src/servatrice_database_interface.cpp`: the user-level bitmask and `getUserAlts`

## Testing
After the rebase onto `a6642c3`: `git submodule update` (servatrice `add65ca`), `npm ci`. Vitest ran with `--maxWorkers=2`, turbo with `--concurrency=1`.

- `npm run typecheck`: 5/5 packages pass.
- `npm run lint`: clean.
- Unit: sockatrice 775 tests / 39 files; datatrice 1196 / 29; webatrice 1476 (+2 skipped) / 200 files (+2 skipped). All pass.
- Integration: sockatrice 166 / 19 files; datatrice 136 / 9; webatrice 160 (+2 skipped) / 36 files (+2 skipped). All pass.
- E2E (under the mutex, chromium + firefox + webkit):
  - `SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca`: `specs/staff-tools.spec.ts` 6 passed (server message update, alts lookup).
  - Default 3.0 image: `specs/moderation-room-user.spec.ts` + `specs/staff-tools.spec.ts` 9 passed.

## Notes for reviewers
- **How this was folded into the stack.**
  - **#12's moderator functions panel** (grant replay access, force activate) moves from the Logs page to the Administration page, the desktop location. Desktop's `TabLog` has no such panel.
    - #12's outcome handling moves with it as `features/administration/useModeratorFunctions.ts`: success and `commandFailed` signals, pending-request matching, and the replay-list re-read.
    - Its `Moderation.functions.*` strings become the `Administration.*` strings.
    - Its component, spec, form schemas and Logs-page CSS are removed. Its integration cases now drive the Administration page.
    - There is one Sockatrice implementation of each command: #12's, including its `RespActivationAccepted` fix. My earlier per-call callbacks on these commands are dropped.
  - **Staff menu entries** are one-line entries in #10's `userMenuEntries.ts`. Entries gain an optional `requires` capability, so 3.1 pages are hidden on 3.0 servers. My own TopBar menu block and `useStaffNavOptions` are gone. #10 deleted `useLeftNav`, so my edits there are dropped too. The TopBar keeps only the transient tab titles for the four routes.
  - **E2E accounts.** One moderator and one admin: #12's `e2e_moderator` (admin = 2) and `e2e_superuser` (admin = 1), via `E2E_MODERATOR` / `E2E_ADMIN`. My `e2e_root` / `e2e_mod` seeds are dropped.
  - **i18n.** #12's widget owns the `Moderation` namespace, so the Moderation page's strings use `ModerationPage` (prebuild throws on a top-level collision).
- **Hooks exported from `@app/hooks`:**
  - `useOpenUserInvestigation()` returns `(userName) => void`, which navigates to `/moderation?user=<name>`. An open Moderation page switches to that user, as `TabSupervisor::openTabModeration(userName)` does.
  - `useAdminLocked()` reads the admin lock.
- **Who sees Administration.** The brief said "admin-only", but desktop offers the Admin tab to every moderator: the moderator group is usable, and the server group is disabled unless the user is an admin. I followed desktop.
- **Reset Password is shown to admins only.** Desktop shows it to every moderator, but Servatrice serves `Command_ResetUserPassword` only through the admin command family.
- **Server message, shutdown and reload.** Desktop shows no feedback for these. Here a server `RespOk` shows a toast, and a failure shows an error with #04's reason, as the matrix's "records server acknowledgment" asks.
- **Lock scope.** It is per page load and starts unlocked, as desktop opens the admin tab unlocked. It does not reset on logout.
- **"Investigate user" is offered only where the Moderation page can work** (3.1 servers). Desktop master always shows it.
- **`ServerCapability` is also exported flat** from `@cockatrice/datatrice`. tsup's namespace bundle keeps only the type under `server`.
- **parity/14 (reports)** will probably also implement `reportUserInfo` in `ModeratorResponseImpl`. Here it dispatches `userInfoReport` into `server.staff.investigations[userName].info`, and its failure is the `reportUserInfo` `commandFailed` name. Whichever branch lands second should reuse those.
- **Left for later.** The card-name field on Card Art Rules has no autocomplete (desktop uses a completer over the card database).
- **Backups** of the pre-rebase branch and the unsquashed rebase: `backup/parity-13-pre-rebase-3481018` and `backup/parity-13-rebased-unsquashed`.
