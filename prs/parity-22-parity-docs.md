# docs: add the Cockatrice parity status and PR series guide

## Summary
- Adds one file, `docs/cockatrice-parity.md`, per orchestrator M1. The audit docs were never in the repo, so this file stands alone. It replaces the separate matrix and series files this branch first pushed.
  - **Matrix**: one row per parity ID (94). Each row has its capability, priority, status (`<now> (was <audit>)`), the closing branch or the planned owner, and a one-line note.
  - **Summary**: audit 29 Complete / 35 Partial / 22 Missing / 6 Divergent / 2 Unverified. After the series: 76 Complete / 10 Partial / 4 Missing / 4 Out of scope. 54 rows changed. A "Still open" table lists each remaining gap and its owner.
  - **Cockatrice 3.1 features outside the audit**: reports, developer role, metrics, card art rules (done); playmats, RTT, deck share links and public decks (planned `parity/23`).
  - **Out of scope for a browser client**: local/offline game (LONG-005), auto-update (LONG-031), plugins (LONG-032), tray, single instance, file associations, fullscreen and folders (LONG-033), on-disk paths and picture cache, and automatic reconnect (PLAT-006: explicit re-login, as on desktop).
  - **PR series**: merge order with title, rows closed and the branch each PR stacks on (computed from the branch graph), plus a reviewer guide covering gate/infra, protocol-only, refactors and features.

## Parity rows closed
None directly. This PR records the status of all 94 rows. PLAT-006 and LONG-005/031/032/033 are settled by decision and documented.

## Desktop reference
Checked at Cockatrice `add65caa`:
- `window_main.cpp`: `startLocalGame`, `actFullScreen`, `actOpenSettingsFolder` / `actOpenCustomFolder`, `QSystemTrayIcon`
- `libcockatrice_network/.../server/local/local_server.h`: `LocalServer : public Server`
- `client/network/update/client/client_update_checker.cpp`, `release_channel.h`, `dlg_update.cpp`: `QProcess::startDetached`
- `main.cpp:241`: `addLibraryPath(.../plugins)` is the only plugin reference
- `single_instance_manager.cpp`: `QLocalServer`; `interface/intents/url_parser.cpp`: `cockatrice://` scheme
- `cmake/NSIS.template.in`, `cmake/Info.plist`, `cockatrice/cockatrice.desktop`: `.cod` and URL-scheme registration
- `general_settings_page.cpp`: path pickers
- `remote_connection_controller.cpp`: `onSocketError` / `onServerTimeout` show an error and call `connectToServer()`, which opens the Connect dialog. No automatic re-auth.
- `server_abstractuserinterface.cpp`: `joinPersistentGames` sends `createGameJoinedEvent(..., resuming=true)` on login

## Testing
- `npm run lint`: 3/3 tasks pass. Docs only; no code changed.
- Diff against `parity/13-administration`: 1 file, +238 lines.

## Notes for reviewers
- **Statuses come from each branch's PR notes, not from re-running the branches.**
- **Judgement calls:**
  - PLAT-006 is marked Complete "by decision".
  - PLAT-026 moved from Unverified to Partial: e2e now runs on three browsers, but there is still no API preflight.
  - LONG-010 moved from Missing to Partial (#19).
  - GAME-018's owner is 05 (PB-13) or 17.
- **Rows with no planned owner:** LONG-010 (remainder), LONG-012 (remainder other than playmats), LONG-017, PLAT-026, PLAT-028.
- **Pre-existing on the base (`parity/13-administration`):** the pre-commit `translate` hook rewrites `packages/webatrice/src/i18n-default.json` (+45/−45). The checked-in file is stale against the co-located `*.i18n.json` sources. I reverted the hook's change so this PR stays docs-only. Someone should regenerate that file on 13, or on whichever branch introduced the drift.
