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
- **Card Art Rules** mirrors `TabCardArtRules`: list, add, remove the selected rule, and refresh. The printing is picked from the local card database ("set long name #number", keyed by uuid); a typed provider id, or none, is accepted when the card isn't there, as desktop and Servatrice allow. Both fields stop at Servatrice's 255-character limit. Rows are selectable with the keyboard (Enter/Space) as well as the mouse.
- **Developer** mirrors `TabDeveloper`: server statistics, a per-command table sorted by total time, and auto-refresh (5 to 3600 s). Only developers see it.
- **User context menu.** #12's moderator section gains desktop's "Investigate user" (after "View admin notes", enabled for another user, on 3.1 servers), which opens the Moderation page on that user. Desktop's admin lock now hides the whole moderator section while the Administration page is locked, as `TabSupervisor::getAdminLocked` does.
- **Admin lock in games.** As on desktop, a locked moderator loses the in-game moderator powers: "Kick from game" in the player list is offered only to the host or an unlocked moderator (`user_context_menu.cpp:416`), and talking as a spectator where the game forbids it is allowed only for an unlocked moderator or the game's judge (`tab_game.cpp:1423`, matching Servatrice's `cmdGameSay`).
- **Guards.** `ModGuard`, `DeveloperGuard` and `CapabilityGuard` wrap the page body and mount it only when allowed, so a non-moderator or a 3.0 server never receives the commands the pages send on mount.
- **One failure mechanism.**
  - The staff lookups, avatar removal, the card-art list and the three server-administration commands report a failure through the scope's `commandFailed`, from #12, and carry #04's transport reason. `getServerStats` gets a new optional `IDeveloperResponse.commandFailed`. Adding and removing a card-art rule do not report failures yet (no `onError` in `addCardArtRule` / `removeCardArtRule`); the page re-lists after each, as desktop does.
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
Final tip `TIP13`, after `git submodule update --init` (servatrice `add65ca`) and `npm ci`. Vitest ran with `--maxWorkers=2`, turbo with `--concurrency=1`.

- `npx turbo run typecheck --concurrency=1`: all packages pass. Each commit of the rewritten feature range (`6d53388`, `b97950e`, `c51650d`) also typechecks.
- `npm run lint`: clean.
- Unit: sockatrice 775 tests / 39 files; datatrice 1196 / 29; webatrice 1491 (+2 skipped) / 200 files (+2 skipped). All pass.
- Integration: sockatrice 166 / 19 files; datatrice 136 / 9; webatrice 160 (+2 skipped) / 36 files (+2 skipped). All pass. `moderation.spec.tsx` also passes (10/10) at the rewritten feature commit `6d53388`.
- Each new behaviour test was run against the code before its fix and failed there (guards 5, admin lock 3, card-art provider/length 2, keyboard rows 2).
- E2E: webatrice on chromium + firefox + webkit against the default 3.0 image ran on #06's tip, which contains this branch; see #06's PR file. The 3.1-only `staff-tools.spec.ts` was not re-run (the master Servatrice image was not built in this run); its flows are unchanged by the review fixes.

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

## Review response (rv4)
- **Guards let the page body mount** → fixed (`fix(webatrice): mount staff page bodies only when the guards allow them`). The guards take children and render them only when allowed; each staff page mounts its body inside them. The gating specs now assert that no `getModeratorLastLogins`, `?user=` lookup or `listCardArtRules` was sent.
- **Admin lock not wired into in-game powers** → fixed (`fix(game): honour the admin lock for in-game moderator powers`). Kick from game is host-or-unlocked-moderator; spectator chat follows `tab_game.cpp:1423` (unlocked moderator or the game's judge). Specs cover a locked non-host moderator (no Kick), a locked host (Kick stays), and the four spectator-chat cases.
- **Provider id required** → fixed (`fix(card-art-rules): accept a rule without a provider id, cap both fields`): `cardProviderId` is optional, both fields `.max(255)` with `maxLength` on the inputs.
- **Red intermediate commits** → fixed by history rewrite (fixup only): the unit specs (old `407ede9`) and the webatrice integration-spec migration from old `75a74eb` are folded into the feature commit, now `6d53388`; "Investigate user" (`b97950e`) and the round-trip specs (`c51650d`) follow. The tree at the old tip `8fca043` is byte-identical to the rewritten one before the review fixes.
- **Rows mouse-only** → fixed (`fix(card-art-rules): let keyboard users select a rule row`): rows take focus, Enter/Space selects, the table is a single-select `role="grid"`.
- **"One failure mechanism" overclaim** → description corrected (card-art add/remove have no failure report). Commit `3df3d96`'s title is left as is (the fix template allows only fixup/squash rewrites).
- Orchestrator M1: 13's `commandFailed` design is unchanged; the final restack will dedupe it against #03's scope-level `commandFailed` (f03).
- Not addressed (minor/nit, outside this task's list): card-art printings staleness, the double card-art sync path and missing `CARD_ART_RULE_*` types, investigation pruning, lock reset on logout, `serverSupports` in TopBar, the three notice types, table/password accessible names, the e2e 3.1 detection, Shutdown button label, `ms` i18n. The `CapabilityGuard` type nit is fixed in passing (it now imports `ServerCapability`).

