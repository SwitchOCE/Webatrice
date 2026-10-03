# feat: account self-service, activation login, public server discovery and user-menu navigation

> **Stacks on parity/04-command-outcomes** (`58b4116`, which sits on #12 → #03 (3.1 protocol) → #02 → #01). Review and merge after #04.

## Summary
- **Account dialogs (PLAT-014 / LONG-019).** Edit, Change Password and Change Avatar on the Account page now open working react-hook-form + zod dialogs modelled on `DlgEditUser`, `DlgEditPassword` and `DlgEditAvatar`. Edit first re-fetches the user's own record (desktop `actEdit`). On hash-capable servers it asks for the current password only when the email changes, and sends the email only then. Avatars are downscaled to 1024 px and re-encoded as JPEG on a canvas, halving until they fit Servatrice's `MAX_FILE_LENGTH`. Confirming with no image removes the avatar. Every desktop response-code message is shown. When the server never answered, the dialog shows #04's timed-out / connection-lost / not-sent reason instead (`useCommandFailureMessage`). A refusal leaves the dialog open with the user's input; success closes it with a toast.
- **Transport fixes the dialogs needed (Sockatrice).** `accountPassword` used to send `new_password` and `hashed_new_password` together. Servatrice reads the plaintext field whenever it is present, so hash-capable servers got plaintext. It now hashes under a fresh salt when the server supports it, and sends plaintext only when it does not. `accountEdit` always set `password_check`, so any edit without one failed with `RespWrongPassword`. It now takes a params object and leaves omitted fields unset. All three commands take `onSuccess` / `onFailure(responseCode, failure?)` callbacks, following `replaySubmitCode`; `failure` is #04's `CommandFailure`. The client records `SupportsPasswordHash` at identification (desktop `getServerSupportsPasswordHash`) and reports it through a new optional third `updateInfo` argument into `server.info.supportsPasswordHash`, which is `undefined` until a server reports it.
- **Activation → login (PLAT-012).** The password from registration or login is kept in a memory-only ref through activation and passed to `activateAccount`, so the post-activation login Sockatrice already fires uses a real credential. It is never stored in Redux (the action slice snapshots payloads) or in Dexie. It is cleared on success or when the dialog closes. `accountActivationFailed` gains an optional `CommandFailure` (additive), so an activation that timed out or lost its connection says so instead of reporting a rejected token.
- **Public server discovery (PLAT-010).** The host picker downloads desktop's list, `https://cockatrice.github.io/public-servers.json`, the first time it is opened. There is one shared download per session, a refresh button, a 10 s timeout, and a fallback to the last good download (localStorage) when offline or the document is malformed. Entries whose address matches a saved host are left out, so saved hosts and their credentials are never touched. Inactive entries are dropped, as desktop does. Entries without a `websocketPort` are shown disabled ("Desktop client only: no WebSocket port"). Picking a reachable entry saves it on its WebSocket port and selects it.
- **Navigation (PLAT-015).** The TopBar user menu is now driven by `feature-wrappers/layout/userMenuEntries.ts`. Each entry is one line of `{ label, icon, route, visibleTo }`, with exported `isModerator` / `isAdmin` predicates. It wires Account, Settings, Shortcuts and Logs. Logs is shown to moderators **and developers**, as in desktop `TabSupervisor`. The Logs page now admits developers. A developer who is not a moderator searches through the 3.1 developer family (`request.developer.viewLogHistory`, as desktop `TabLog` does) without the IP filter and Private Chat, and does not see the moderator functions. The developer search now reports failures through `moderator.commandFailed`, so the page settles with #04's reason. #12 and #13 left this out of scope. Replays and Administration can each be added later as a single entry. The orphaned `LeftNav.tsx`, `LeftNav.css`, `useLeftNav.ts` and its spec had no importers and are deleted. Card import was reachable only from that dead LeftNav, so the user menu now opens `CardImportDialog`.

## Parity rows closed
PLAT-010, PLAT-012, PLAT-014, LONG-019, PLAT-015

## Desktop reference
- `cockatrice/src/interface/widgets/server/user/user_info_box.cpp`: `actEdit` / `actEditInternal` / `actPassword` / `changePassword` / `actAvatar` / `process{Edit,Password,Avatar}Response`
- `cockatrice/src/interface/widgets/dialogs/dlg_edit_user.cpp`, `dlg_edit_password.cpp`, `dlg_edit_avatar.cpp` (+ `MAX_AVATAR_DIMENSION`), `libcockatrice_utility/.../string_limits.h`
- `servatrice/src/serversocketinterface.cpp`: `cmdAccountEdit` / `cmdAccountPassword` / `cmdAccountImage` (field presence semantics)
- `cockatrice/src/client/network/connection_controller/remote_connection_controller.cpp` (activation flow)
- `cockatrice/src/interface/widgets/server/handle_public_servers.cpp`, `dialogs/dlg_connect.cpp`
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp` (Tabs menu order and moderator gating)

## Testing
Run on the rebased tip after `git submodule update` (vendor at `add65ca`) and `npm ci`, with Vitest capped at `--maxWorkers=2` because the shared host is short on memory.
- Every commit in the stack passes `npx turbo run typecheck --concurrency=1` (5/5) and `npm run lint` (3/3, 0 errors).
- Unit tests:
  - sockatrice: 743 passed (39 files).
  - datatrice: 1152 passed (27 files).
  - webatrice: 1347 passed, 2 skipped (185 files; both skips were already there).
- Integration tests:
  - sockatrice: 159 passed (18 files).
  - datatrice: 127 passed (8 files).
  - webatrice: 144 passed, 2 skipped (36 files).
- New e2e `e2e/specs/account-self-service.spec.ts` runs against the real Servatrice (3.0.0 default image), under the e2e mutex. It registers a user, opens Account from the user menu, changes the real name and email with the password check, gets refused a password change with a wrong old password, changes the password, then signs out and logs back in with the new one. I ran it together with `login-join-room.spec.ts`: 6/6 passed across chromium, firefox and webkit. Before the rebase, the full suite passed 21/21 once the new spec was fixed; I did not repeat the full run on the rebased tip.

## Notes for reviewers
- `ISessionResponse.updateInfo` gains an optional third argument (`supportsPasswordHash`), so existing `IWebClientResponse` implementations still compile. When it is absent, `server.info.supportsPasswordHash` stays `undefined` (not yet known), following the host record's `supportsHashedPassword` convention. The edit dialog treats unknown like a hash-capable server, the stricter case. `accountEdit` and `accountPassword` signatures did change; neither had callers outside Sockatrice.
- Desktop sends a `Command_RequestPasswordSalt` before a hashed password change and only checks it for `RespOk`; the salt itself is unused. I left that round trip out. It can be added if reviewers want the extra pre-check.
- Staff destinations from #13/#14 (Administration, Moderation, Developer, My Reports) should be added as one-line entries in `userMenuEntries.ts`, which is meant to stay the single user-menu list. The exported `isModerator` / `isAdmin` / `isDeveloper` / `canReadLogs` predicates cover their gating.
- Public server discovery is a plain HTTP fetch, not a server command, so #04's `CommandFailure` does not apply. Its own timeout and offline fallback cover that case.
- Countries: the edit dialog sends desktop's lowercase ISO code. RegisterForm still sends uppercase, an existing divergence I did not touch.
- The public list's `host` + `websocketPort` can differ from how Webatrice's bundled defaults reach the same servers (e.g. `server.cockatrice.us/servatrice`). Address matching keeps the bundled entries, so the list adds only servers the user doesn't already have. Matching saved hosts are not updated from the list (desktop's `updateExistingServerWithoutLoss`), as requested: user hosts are never overwritten.
- Login error-code mapping (server full / password change required) is untouched; a sibling PR owns it.
