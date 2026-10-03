# Cockatrice parity

Where Webatrice stands against the desktop client, and how the parity PR series gets it there. Desktop Cockatrice at
master `add65ca` is the spec.

The rows come from a functional-parity audit of Webatrice `cfdf276` against Cockatrice `a571a9a` (2026-08-24): 94
stable IDs in three areas. `PLAT` covers platform, connection, account, rooms, chat and users; `GAME` covers decks,
the game lobby and live play; `LONG` covers replays, settings, accessibility, moderation, card data and desktop
tooling. Statuses:

- **Complete**: the capability is available. It need not be pixel- or interaction-identical.
- **Partial**: a usable or lower-layer implementation exists, but important behaviour is missing.
- **Missing**: no implementation.
- **Out of scope**: not a parity target for a browser client; see [Out of scope](#out-of-scope-for-a-browser-client).

Priority is the audit's impact rating: P1 is a major normal workflow, P2 secondary, P3 specialised or low impact.
No P0 blocker was found.

## Summary

| | Complete | Partial | Missing | Divergent | Unverified | Out of scope |
|---|---|---|---|---|---|---|
| Audit (2026-08-24) | 29 | 35 | 22 | 6 | 2 | — |
| After the series | 76 | 10 | 4 | 0 | 0 | 4 |

54 rows changed status. Every P1 row is Complete except PLAT-026, PLAT-028, LONG-009 and LONG-017, and LONG-005,
which is out of scope.

### Still open

| Rows | What remains | Owner |
|---|---|---|
| GAME-021, GAME-023, GAME-027, GAME-028, GAME-029, GAME-030 | Open the game deck by hash, custom zones, tally, next phase with action, reverse turn, rotate view | `parity/17-game-actions` (planned) |
| GAME-018 | Select All / Select Column in zone views | `parity/05-refactor-seat` (PB-13) or `parity/17-game-actions` |
| LONG-009 | Shortcuts for the game actions that have none | `parity/17-game-actions` |
| LONG-012 | Playmats; card presentation options; backgrounds | Playmats: `parity/23` (planned). Rest: none |
| LONG-016 | Hard-coded English; missing-key CI check | i18n sweep (planned) |
| LONG-010 | Game-board preferences that need board behaviour first | None |
| LONG-017 | Keyboard-path and accessible-name audit | None |
| PLAT-026 | API preflight beyond Dexie; unsupported-browser screen | None |
| PLAT-028 | Forced-drop reconnect e2e; typecheck of `e2e/` | None |

## Matrix

"Closed by" names the branch that did the work. "Audit baseline" means the row was already Complete at the audit.

### Platform, connection, account, server, room, chat and users

| ID | Capability | Priority | Status | Closed by / owner | Note |
|---|---|---|---|---|---|
| PLAT-001 | Protocol: protocol framing/version/features | P3 | Complete | audit baseline |  |
| PLAT-002 | Protocol: current protocol source synchronization | P1 | Complete (was Partial) | `parity/03-protocol` | Vendored protocol at Cockatrice `add65ca`; builder for every new command. |
| PLAT-003 | Protocol: client version identity | P2 | Complete (was Divergent) | `parity/03-protocol` | `clientver` is `webatrice-<version> (<commit date>)`, like desktop `VERSION_STRING`. |
| PLAT-004 | Protocol: command response lifecycle | P2 | Complete (was Partial) | `parity/04-command-outcomes` | Per-command deadline; timeouts and disconnects settle once with `RespNotConnected`. |
| PLAT-005 | Transport: browser WebSocket and keepalive | P3 | Complete | audit baseline | e2e covers Chromium, Firefox and WebKit since `parity/06-e2e-hardening`. |
| PLAT-006 | Transport: unexpected-drop recovery | P1 | Complete (was Partial) | by decision | Explicit re-login, as desktop. See [Out of scope](#out-of-scope-for-a-browser-client). |
| PLAT-007 | Transport: close-reason handling and state teardown | P3 | Complete | audit baseline |  |
| PLAT-008 | Server events: shutdown and directed server notices | P1 | Complete (was Partial) | `parity/04-command-outcomes`, `parity/14-reports` | Shutdown and directed notices (04); report notices (14). |
| PLAT-009 | Persistence: known hosts, remembered verifier, and auto-login | P3 | Complete | audit baseline |  |
| PLAT-010 | Connection UI: public server discovery | P2 | Complete (was Partial) | `parity/10-account-auth` | Public server list with cached fallback. |
| PLAT-011 | Auth: login, registration, and password recovery | P3 | Complete | audit baseline |  |
| PLAT-012 | Auth: activation-to-login credential continuity | P1 | Complete (was Partial) | `parity/10-account-auth` |  |
| PLAT-013 | Auth: actionable login errors | P2 | Complete (was Partial) | `parity/03-protocol` | Server full and password change required are mapped. |
| PLAT-014 | Account: self-service profile/password/avatar editing | P1 | Complete (was Partial) | `parity/10-account-auth` | Same work as LONG-019. |
| PLAT-015 | Navigation: reachable platform routes | P1 | Complete (was Partial) | `parity/10-account-auth` | User menu from `userMenuEntries.ts`; dead LeftNav removed. |
| PLAT-016 | Lobby: room lobby and safe MOTD | P3 | Complete | audit baseline |  |
| PLAT-017 | Room: room permission display | P2 | Complete (was Partial) | `parity/11-rooms-chat-users` |  |
| PLAT-018 | Room: room-join failure feedback | P1 | Complete (was Partial) | `parity/11-rooms-chat-users` | Includes desktop's leave-and-rejoin on `RespContextError`. |
| PLAT-019 | Room: autojoin and room-tab lifecycle | P3 | Complete | audit baseline |  |
| PLAT-020 | Room users: online/buddy/ignore side panel | P3 | Complete | audit baseline |  |
| PLAT-021 | Room chat: ignored-user, flood, and history semantics | P1 | Complete (was Partial) | `parity/11-rooms-chat-users` |  |
| PLAT-022 | Private chat: delivery status and draft recovery | P1 | Complete (was Partial) | `parity/11-rooms-chat-users` |  |
| PLAT-023 | Notifications: private-message background notification | P2 | Complete (was Partial) | `parity/19-settings` | Browser notifications after explicit permission; toast fallback. |
| PLAT-024 | Users: profile, buddy, and ignore core actions | P3 | Complete | audit baseline |  |
| PLAT-025 | Users: show games of user | P2 | Complete (was Missing) | `parity/11-rooms-chat-users` | Same work as LONG-022. |
| PLAT-026 | Browser support: declared browser compatibility | P1 | Partial (was Unverified) | `parity/06-e2e-hardening` | Remains: API preflight beyond Dexie, unsupported-browser screen. No branch planned. |
| PLAT-027 | Reliability: fatal UI error containment | P1 | Complete (was Missing) | `parity/04-command-outcomes` | Route and game error boundaries. |
| PLAT-028 | Quality gates: platform regression gate | P1 | Partial | `parity/01-lint`, `parity/06-e2e-hardening` | Remains: forced-drop reconnect e2e, typecheck of `e2e/`. No branch planned. |

### Decks, game lifecycle and live gameplay

| ID | Capability | Priority | Status | Closed by / owner | Note |
|---|---|---|---|---|---|
| GAME-001 | Deck storage: Server deck CRUD and persistence | P3 | Complete | audit baseline |  |
| GAME-002 | Deck storage: Remote folder hierarchy | P3 | Complete (was Partial) | `parity/18-decks` |  |
| GAME-003 | Deck editor: Core edit/search/printing/commander/bracket workflow | P3 | Complete | audit baseline |  |
| GAME-004 | Deck validation: Card format legality and allowed quantity | P2 | Complete (was Missing) | `parity/18-decks` |  |
| GAME-005 | Deck safety: Undo/redo and edit history | P2 | Complete (was Missing) | `parity/18-decks` |  |
| GAME-006 | Deck metadata: Banner card and tags | P3 | Complete (was Partial) | `parity/18-decks` |  |
| GAME-007 | Deck tools: Sample hand | P3 | Complete (was Missing) | `parity/18-decks` |  |
| GAME-008 | Deck interchange: Text/clipboard/file import and export | P3 | Complete | audit baseline |  |
| GAME-009 | Deck integrations: Online load/export/analyze/print helpers | P3 | Complete (was Partial) | `parity/18-decks` |  |
| GAME-010 | Game creation: Protocol-relevant game options | P3 | Complete | audit baseline |  |
| GAME-011 | Join/spectate: Player, spectator and judge join with passwords/errors | P3 | Complete | audit baseline |  |
| GAME-012 | Lobby: Deck select, ready, chat, host kick and leave | P3 | Complete | audit baseline |  |
| GAME-013 | Lobby: Force start | P1 | Complete (was Divergent) | `parity/16-game-lobby` | One `ReadyStart {ready, force_start}`, as desktop. |
| GAME-014 | Between games: Sideboard plan and lock before ready | P2 | Complete (was Partial) | `parity/16-game-lobby` |  |
| GAME-015 | Lifecycle/roles: Host change/kick, judge override, spectator gating, concede/unconcede, leave/close | P3 | Complete | audit baseline |  |
| GAME-016 | Battlefield: Movement, DnD, stack and selection/bulk actions | P3 | Complete | audit baseline | Hand reorder fixed in `parity/02-hand-reorder`. |
| GAME-017 | Card state: Tap, face/peek/flip, P/T, annotation, clone/related, counters | P3 | Complete | audit baseline |  |
| GAME-018 | Zone-view selection: Select all/column in grave/exile view | P3 | Partial | `parity/05-refactor-seat` (PB-13) or `parity/17-game-actions` (planned) | Remains: Select All / Select Column in zone views. |
| GAME-019 | Hand: View/sort/reveal/random reveal/mulligan/move-all/play | P3 | Complete | audit baseline |  |
| GAME-020 | Library: Draw/undo/search/reveal/lend/top-bottom/move-until/partial shuffle | P3 | Complete | audit baseline |  |
| GAME-021 | Library: Open current game deck in editor | P3 | Partial | `parity/17-game-actions` (planned) | Remains: match by deck hash, not name. |
| GAME-022 | Other standard zones: Graveyard, exile, live sideboard and stack actions | P3 | Complete | audit baseline |  |
| GAME-023 | Custom zones: View and act on arbitrary server-defined zones | P2 | Missing | `parity/17-game-actions` (planned) | Remains: custom-zone menu and view. |
| GAME-024 | Counters/chance: Player/card counters, dice, coin, increment-all | P3 | Complete | audit baseline |  |
| GAME-025 | Tokens: Custom/repeat/predefined/related/clone tokens | P3 | Complete | audit baseline |  |
| GAME-026 | Arrows/attachments: Create/delete/clear arrows and attach/unattach cards | P3 | Complete | audit baseline |  |
| GAME-027 | Battlefield summary: Subtype tally and total power | P3 | Missing | `parity/17-game-actions` (planned) | Remains: tally subtypes / total power. |
| GAME-028 | Turns/phases: Direct phase, next/previous, pass turn, phase action | P3 | Partial | `parity/17-game-actions` (planned) | Remains: next phase with action. |
| GAME-029 | Turns: Reverse turn order | P2 | Missing | `parity/17-game-actions` (planned) | Remains: reverse-turn action and shortcut. |
| GAME-030 | Board view: Manual player-view rotation | P3 | Missing | `parity/17-game-actions` (planned) | Remains: rotate view CW/CCW. |
| GAME-031 | Shortcuts: Core gameplay shortcut coverage and customization | P3 | Complete | audit baseline |  |
| GAME-032 | Live log/chat: Gameplay event log and game chat | P3 | Complete | audit baseline |  |
| GAME-033 | Invitations: Invite a specific user from the live game | P3 | Complete (was Partial) | `parity/16-game-lobby` | Invite and copy `cockatrice://joingame` link; links in chat join. |

### Replay, settings, accessibility, moderation and desktop/browser tooling

| ID | Capability | Priority | Status | Closed by / owner | Note |
|---|---|---|---|---|---|
| LONG-001 | Replay: Server replay catalog | P1 | Complete (was Partial) | `parity/15-replays` |  |
| LONG-002 | Replay: Replay playback and timeline | P1 | Complete (was Missing) | `parity/15-replays` |  |
| LONG-003 | Replay: Local replay files and library | P2 | Complete (was Missing) | `parity/15-replays` | Library in IndexedDB; `.cor` via file picker. |
| LONG-004 | Replay: Download, deletion, retention lock, and share codes | P2 | Complete (was Partial) | `parity/15-replays` |  |
| LONG-005 | Local play: Local/offline game | P1 | Out of scope (was Missing) | — | See [Out of scope](#out-of-scope-for-a-browser-client). |
| LONG-006 | Logs: Moderator log-history search | P3 | Complete (was Partial) | `parity/12-moderation-users` |  |
| LONG-007 | Diagnostics: Client debug-log viewer | P3 | Complete (was Missing) | `parity/21-appearance-i18n-diag` | Bounded, redacted, in memory; copy and clear. |
| LONG-008 | Settings: General preference surface and persistence | P2 | Complete (was Missing) | `parity/19-settings` |  |
| LONG-009 | Settings: Keyboard shortcut editor | P1 | Partial | `parity/17-game-actions` (planned) | Remains: shortcuts for game actions that have none. |
| LONG-010 | Settings: Interface and gameplay preferences | P2 | Partial (was Missing) | `parity/19-settings`; rest unplanned | Remains: options that need board behaviour first (listed in 19). |
| LONG-011 | Settings: Chat preferences, alerts, and macros | P2 | Complete (was Missing) | `parity/19-settings` | Mention completer is a follow-up; Say macros go to 17. |
| LONG-012 | Appearance: Themes, palette, and table presentation | P2 | Partial (was Divergent) | `parity/21-appearance-i18n-diag`; playmats `parity/23` (planned) | Palette done. Remains: playmats, card presentation, backgrounds. |
| LONG-013 | Sound: Sound themes, enable/mute, volume, and test | P2 | Complete (was Missing) | `parity/19-settings` |  |
| LONG-014 | Notifications: Configurable desktop and in-app notifications | P2 | Complete (was Partial) | `parity/19-settings` |  |
| LONG-015 | Storage: Cache, file-path, and storage controls | P3 | Complete (was Divergent) | `parity/21-appearance-i18n-diag` | Storage usage and clears; desktop paths N/A (see Out of scope). |
| LONG-016 | Localization: Localized UI and language selection | P2 | Partial | `parity/21-appearance-i18n-diag`; i18n sweep (planned) | Remains: hard-coded English, missing-key CI check. |
| LONG-017 | Accessibility: Keyboard, focus, semantics, and assistive technology | P1 | Partial | — | Skipped drag suites now run (05). Remains: keyboard and accessible-name audit. No branch planned. |
| LONG-018 | Account: Registration, activation, and password recovery | P1 | Complete | audit baseline |  |
| LONG-019 | Account: Edit profile, password, and avatar | P1 | Complete (was Partial) | `parity/10-account-auth` |  |
| LONG-020 | Users: Buddy and ignore management | P1 | Complete | audit baseline |  |
| LONG-021 | Users: User details and private chat | P1 | Complete | audit baseline |  |
| LONG-022 | Users: Show a user's current games | P2 | Complete (was Missing) | `parity/11-rooms-chat-users` |  |
| LONG-023 | Safety: Report a user and track own reports | P1 | Complete (was Missing) | `parity/14-reports` | Needs a 3.1 server. |
| LONG-024 | Moderation: Warn, ban, histories, notes, roles, and kick | P3 | Complete (was Partial) | `parity/12-moderation-users` |  |
| LONG-025 | Moderation: Report review and case management | P3 | Complete (was Missing) | `parity/14-reports` | Needs a 3.1 server. |
| LONG-026 | Moderation: User investigation and remediation | P3 | Complete (was Missing) | `parity/13-administration` | Needs a 3.1 server. |
| LONG-027 | Administration: Server message, shutdown, config reload, lock, activation, and replay access | P3 | Complete (was Partial) | `parity/13-administration` |  |
| LONG-028 | Card data: Manual Oracle/card-data import | P2 | Complete (was Partial) | `parity/20-card-data` |  |
| LONG-029 | Card data: Database/spoiler update and artwork source management | P2 | Complete (was Partial) | `parity/20-card-data` | Database download stays a file pick. |
| LONG-030 | Card data: Set, custom card/token, and preferred-art management | P2 | Complete (was Missing) | `parity/20-card-data` |  |
| LONG-031 | Updates: Client version and update checks | P3 | Out of scope (was Divergent) | — | See [Out of scope](#out-of-scope-for-a-browser-client). |
| LONG-032 | Extensibility: Plugin discovery and management | P3 | Out of scope (was Unverified) | — | See [Out of scope](#out-of-scope-for-a-browser-client). |
| LONG-033 | Desktop integration: Fullscreen, tray, folders, intents, status, and tips | P3 | Out of scope (was Divergent) | — | See [Out of scope](#out-of-scope-for-a-browser-client). |

### Cockatrice 3.1 features outside the audit

The audit predates these Cockatrice master additions. `parity/03-protocol` brought in the protocol for all of them.

| Feature (Cockatrice PR) | Status | Branch |
|---|---|---|
| Reports and moderation queue (#7091) | Complete | `parity/14-reports`, `parity/13-administration` |
| Developer staff role (#7211) | Complete | `parity/12-moderation-users`, `parity/10-account-auth`, `parity/13-administration` |
| Live metrics developer tab (#7212) | Complete | `parity/13-administration` |
| Card art rules | Complete | `parity/13-administration` |
| Playmats (#7101), RTT (#7153) | Open | `parity/23` (planned) |
| Deck share links and public decks (#7241) | Open | `parity/23` (planned) |

## Out of scope for a browser client

Each claim was checked against Cockatrice `add65ca`.

| Item | Desktop | Why not in Webatrice |
|---|---|---|
| Local/offline game (LONG-005) | `MainWindow::startLocalGame` runs an in-process `LocalServer`, a subclass of the C++ `Server` in `libcockatrice_network/.../server/remote/`, with one `LocalClient` per seat. | Webatrice has no game server; Servatrice's C++ game logic decides every move. Offline play would mean porting that server to the browser and keeping it in step. A one-seat game on any server covers goldfishing. |
| Client auto-update (LONG-031) | `ClientUpdateChecker` and `ReleaseChannel` find a release; `DlgUpdate` downloads the installer and runs it with `QProcess::startDetached`. | Reloading the page loads the deployed build, so deployment is the update. |
| Plugins (LONG-032) | `main.cpp` only adds `<app dir>/plugins` to Qt's library path, for Qt's own runtime plugins. | There is no user plugin feature to match. |
| Tray, single instance, file associations, fullscreen, folders (LONG-033) | `QSystemTrayIcon` (`window_main.cpp`, `tab_supervisor.cpp`, `tab_message.cpp`); `SingleInstanceManager` over `QLocalServer`; installers register `.cod` (`cmake/NSIS.template.in`, `cmake/Info.plist`) and the `cockatrice://` scheme (`Info.plist`, `cockatrice.desktop`); `actFullScreen`; `actOpenSettingsFolder` and the custom-folder actions. | A page cannot own a tray icon, register file types or URL schemes, or open OS folders, and tabs replace single-instance handoff. The browser covers the outcomes: its own fullscreen, `.cod`/`.cor` file pickers, browser notifications (PLAT-023), and `cockatrice://joingame` links in chat (`parity/16-game-lobby`). |
| On-disk paths and picture cache (part of LONG-015) | `GeneralSettingsPage` path pickers for decks, filters, replays, pictures and card databases; picture-cache method, size, TTL and naming. | Data lives in the origin's IndexedDB and images in the browser's HTTP cache, which a page cannot read or clear. `parity/21-appearance-i18n-diag` shows storage usage and offers targeted clears. |
| Automatic reconnect (PLAT-006) | `ConnectionController::onSocketError` / `onServerTimeout` show an error and reopen the Connect dialog; `RemoteClient` never re-authenticates by itself. On the next login Servatrice re-attaches the user's games (`Server_AbstractUserInterface::joinPersistentGames`, `Event_GameJoined.resuming`). | Webatrice matches desktop: a dropped connection lands on Login with "Connection lost — please log in again", and the server resumes games on login. Re-authenticating automatically would mean keeping credentials after login, which desktop does not do either. |

## PR series

### Merge order

"Stacks on" is the branch each PR was built on; review a PR as its diff against that branch. Numbers 07 and 08 were
not used.

| # | Branch | Title | Rows closed | Stacks on |
|---|---|---|---|---|
| 1 | `parity/01-lint` | fix(webatrice): make the lint gate green and enforce it in CI | — (gate) | `master` |
| 2 | `parity/02-hand-reorder` | fix(game): reorder hand cards on same-zone drag | — (GAME-016 regression) | 01 |
| 3 | `parity/03-protocol` | feat(protocol): move to the Cockatrice 3.1 protocol with full Sockatrice command coverage | PLAT-002, PLAT-003, PLAT-013 | 02 |
| 4 | `parity/12-moderation-users` | feat(moderation): desktop's moderator/admin user actions everywhere, warn list, replay grant, force activate, log search | LONG-006, LONG-024 | 03 |
| 5 | `parity/04-command-outcomes` | feat: total command outcomes, crash containment and server notices | PLAT-004, PLAT-008, PLAT-027 | 12 |
| 6 | `parity/06-e2e-hardening` | test(e2e): make the browser e2e hermetic and fix the worker that never exits | — (test infrastructure) | 04 |
| 7 | `parity/10-account-auth` | feat: account self-service, activation login, public server discovery and user-menu navigation | PLAT-010, PLAT-012, PLAT-014, PLAT-015, LONG-019 | 04 |
| 8 | `parity/11-rooms-chat-users` | feat(rooms,chat,users): desktop-parity room joins, room and private chat feedback, and "Show this user's games" | PLAT-017, PLAT-018, PLAT-021, PLAT-022, PLAT-025, LONG-022 | 10 |
| 9 | `parity/13-administration` | feat(staff): Administration, Moderation, Card Art Rules and Developer pages | LONG-026, LONG-027 | 11 |
| 10 | `parity/14-reports` | feat: report users, My Reports and the moderator report queue (Cockatrice #7091) | LONG-023, LONG-025 | 03 |
| 11 | `parity/15-replays` | feat(replays): replays tab, local replay library and replay playback | LONG-001 to LONG-004 | 03 |
| 12 | `parity/19-settings` | feat(settings): desktop settings page, chat preferences, sound and notifications | LONG-008, LONG-011, LONG-013, LONG-014, PLAT-023 | 11 |
| 13 | `parity/21-appearance-i18n-diag` | feat(settings): appearance palettes, every UI language, storage controls and a debug log | LONG-007, LONG-015 | 19 |
| 14 | `parity/05-refactor-seat` | refactor(game): split PlayerBox into the seat model and existing game owners | — (refactor) | 02 |
| 15 | `parity/16-game-lobby` | feat(game): desktop parity for the pre-game lobby: force start, sideboarding before ready, game invites and links | GAME-013, GAME-014, GAME-033 | 02 |
| 16 | `parity/09-refactor-decks` | refactor(webatrice): split the deck list and deck editor by responsibility | — (refactor) | 02 |
| 17 | `parity/18-decks` | feat(webatrice): deck folders, undo/redo, legality, banner/tags, sample hand and online services | GAME-002, GAME-004 to GAME-007, GAME-009 | 09 |
| 18 | `parity/20-card-data` | feat(webatrice): card database management: sources, reload, Manage sets, custom tokens and picture URL templates | LONG-028, LONG-029, LONG-030 | 02 |
| 19 | `parity/17-game-actions` (planned) | Game actions on the refactored seat | Open GAME rows, LONG-009 | 05 |
| 20 | `parity/23` (planned) | Cockatrice 3.1 extras: playmats, RTT, deck share links, public decks | Part of LONG-012 | 13 |
| 21 | i18n sweep (planned) | Remaining hard-coded strings and a missing-key check | LONG-016 | end of stack |
| 22 | `parity/22-parity-docs` | docs: Cockatrice parity status and PR guide | — (this file) | end of stack |

Branches that stack on 02 or 03 are rebased into this order before they merge. Expect conflicts where branches
share an owner: the user menu `userMenuEntries.ts` (10, 13, 19), the Dexie schema version (15 and 20 each add a
version 5, 19 adds version 6) and the game seat (05, 16, 17).

### Reviewer guide

- **Gate and test infrastructure.** 01 makes the existing lint rules real and runs Webatrice lint in CI. Its only
  behaviour changes are two bug fixes: the Auto Connect checkbox saves again, and deck autosave targets the current
  deck. 06 changes only test code and lint config; no package output changes, so it has no changeset.
- **Protocol only.** 03 moves `vendor/cockatrice` to `add65ca`, regenerates the code, and adds a Sockatrice
  builder for every new command, with minimal Datatrice state. Its only UI is two login messages and the `clientver`
  string. Review its wire shapes against `libcockatrice_protocol` and Servatrice's dispatch tables. New
  response-interface members are optional, so third-party implementers keep compiling.
- **Refactors with no behaviour change.** 09 splits `features/decks` by responsibility, with no visual or
  behaviour change. 05 splits `PlayerBox` into the seat model and the game owners. It has one intentional fix (a
  player may only drag cards they can move, as on desktop), and the hard-coded Ctrl+M / Ctrl+L / Ctrl+R became
  rebindable shortcuts. Its stage-1 characterization specs pin the seat's behaviour, so a changed expectation there
  is where an unintended change would show.
- **Small fix.** 02 fixes hand reordering.
- **Features.** Everything else. Review against the desktop files each PR lists under "Desktop reference".
  - 14 and parts of 13 (user investigation, card art rules, the Developer page) need a 3.1 server. On 3.0 their
    entry points are hidden by `server.Selectors.supports` and the user-menu `requires` capability. Their 3.1-only
    e2e runs on a locally built `webatrice-local/servatrice:master-add65ca` image and skips on the pinned 3.0.0 one.
  - Staff surfaces (12, 13, the queue in 14): check role gating against desktop `UserContextMenu`,
    `TabSupervisor`, `TabAdmin` and `TabModeration`.
