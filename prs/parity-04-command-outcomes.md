# feat: total command outcomes, crash containment and server notices

> **Stacks on claude/parity-12-moderation-users** (`54287c0`, the review-fixed #12, which sits on the 3.1 protocol branch → hand-reorder → lint). Review and merge after #12.

## Summary

- **Every command settles (REL-002 / PLAT-004).** `ProtobufService` keeps each pending command as a record with a deadline timer. Mirroring desktop `RemoteClient::ping` (PendingCommand expiry) and `RemoteClient::doDisconnectFromServer`, a command that outlives its deadline, or is in flight when the connection closes, **starts reconnecting, or is replaced by a new `connect()`**, is answered with a synthesised `RespNotConnected` through the normal response path. It settles exactly once, and a late response is dropped. The default deadline is 18 s, desktop's `(timeout + 1) * keepalive` at default settings. `CommandOptions.timeoutMs` overrides it per command.
- **Typed failure reason.** `onError(responseCode, raw, failure?)` gains a third argument, `WebsocketTypes.CommandFailure` (`NotSent` / `Timeout` / `Disconnected`). It is `undefined` for a server rejection. `onResponse`/`onSuccess` never see a synthesised answer, so the keepalive cannot count a timeout as a pong.
- **Failure paths for commands that had none.** Deck list/download/upload, join room and create game report failures through new optional `IWebClientResponse` callbacks. Datatrice turns these into signal actions. Moderator and admin commands keep #12's single `commandFailed(command, code, target)` mechanism, which gains an optional fourth `failure` argument carrying the same reason, so there is still one mechanism, not two. A join-game transport failure settles the existing join dialog. Login, salt, register and activate no longer overwrite the connection status (for example a ban or shutdown reason) when a disconnect cuts them off. A salt request cut off that way also no longer calls `disconnect()`, which would cancel the reconnect.
- **UI settles with a visible error (Webatrice).** My Decks shows the failure reason and a Retry button instead of an endless spinner. The deck editor leaves its loading skeleton with a reason. Autosave shows "Save failed" and resends on the next change. Room join (user-initiated joins only; a failed autojoin stays silent, as desktop's `setCurrent = false` join does), game creation and deck create/import failures appear in an `AlertDialog`, and the queue is dropped once the status is DISCONNECTED, using desktop's message for server rejections and a timed-out / connection-lost reason otherwise. #12's surfaces use the same reasons in their existing notices: the Logs page (the only log-search error surface), the moderation dialogs (ban/warn history, admin notes, role changes) and the moderator functions (replay access, force activation).
- **Crash containment (PLAT-027 / OBS-001).** `ErrorBoundary` logs the crash through `console.error` (the channel the transport already uses), tagged with the boundary name. `RouteErrorBoundary` wraps the AppShell routes and offers "Reload page" or "Return to lobby". `GameErrorBoundary` wraps the game route inside `Layout`, offers "Reload board", and keeps the top bar and the seat.
- **Server notices (PLAT-008).** New `getNotifications` / `getServerShutdown` selectors feed `ServerNotices`. It shows a "Scheduled server shutdown" dialog with the reason and a live countdown, which re-opens on each re-announcement. It also shows desktop's message box for each `Event_NotifyUser` type (UNKNOWN, IDLEWARNING, PROMOTED, WARNING, CUSTOM) in arrival order. Types this client does not know are skipped, as desktop's `default:` does.

## Parity rows closed

PLAT-004, PLAT-008 (generic notices; report variants are W3's), PLAT-027 (route + game boundaries)

## Desktop reference

- `libcockatrice_network/.../remote/remote_client.cpp`: `ping()` (PendingCommand tick/expiry → RespNotConnected), `doDisconnectFromServer()`, `loginResponse` / `passwordSaltResponse` / `registerResponse` (RespNotConnected handling)
- `libcockatrice_protocol/.../pending_command.{h,cpp}`
- `libcockatrice_settings/.../network_settings.cpp` (keepalive 3, timeout 5); `tab_deck_storage.cpp` / `dlg_share_deck.cpp` (`(timeout + 1) * keepalive` deadline)
- `cockatrice/src/interface/widgets/tabs/tab_server.cpp::joinRoomFinished`, `dialogs/dlg_create_game.cpp::checkResponse`, `tabs/tab_deck_storage.cpp::uploadFinished`
- `cockatrice/src/client/network/connection_controller/remote_connection_controller.cpp::onServerShutdownEvent`
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp::processNotifyUserEvent`
- `servatrice/src/servatrice.cpp::shutdownTimeout` (re-announcement cadence)

## Testing

Run on the final tip `d1cf623` (parent `54287c0`) after `git submodule update --init` and `npm ci`, with Vitest capped at `--maxWorkers=2`.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 packages pass, 0 errors.
- Unit tests (`npm test`):
  - sockatrice: 740 passed (39 files).
  - datatrice: 1150 passed (27 files).
  - webatrice: 1287 passed, 2 skipped (173 files + 2 skipped; the skipped files were already skipped upstream).
- Integration tests (`npm run test:integration`):
  - sockatrice: 162 passed (18 files).
  - datatrice: 127 passed (8 files).
  - webatrice: 142 passed, 2 skipped (34 files + 2 skipped).
- webatrice e2e, Servatrice 3.0.0, chromium + firefox + webkit, in the `mcr.microsoft.com/playwright:v1.60.0-noble` container: 16 passed, 5 failed (6.5 min). The failures are the known `ERR_CERT_AUTHORITY_INVALID` Scryfall cases from running in the container, which does not trust the egress proxy's CA: `app-boots` (chromium, webkit) and `bulk-card-actions` (all three). The same 5 fail on the #12 tip `54287c0`. Login/join-room, game, spectator, connection-stability and moderation specs pass on all three browsers.

Every commit in the range was checked with `git rebase -x`: build, `turbo run typecheck`, and sockatrice unit and integration tests all pass at each commit (11 commits, before the changeset follow-up).

New tests:
- `ProtobufService.outcomes.spec.ts` uses fake timers to cover the default and overridden deadlines, a response arriving after the timeout, a late answer for an expired command not settling a newer one, disconnect failing each command once, and re-entrant resets.
- `handleFailure` cases.
- `commandFailed` passing the transport reason through sockatrice, datatrice, the Logs page, the moderation dialogs and the moderator functions.
- Failure branches of the session, room, deck and moderator commands.
- `integration/src/command-outcomes.spec.ts` covers timeout, late response, socket drop and `connect()` over an open socket with a login in flight over the real stack. `connection.spec.ts` covers a salt request cut off by a drop, which keeps reconnecting. `rooms.spec.ts` covers a failed autojoin being reported as not user-initiated.
- Datatrice impl and selector specs.
- Webatrice specs for `useCommandFailureMessage`, `CommandFailureNotices`, the Decks error state, the `useDeckEditor` download and autosave failures, `ErrorBoundary`/`RouteErrorBoundary`, `GameErrorBoundary` and `ServerNotices` (including the countdown and an unknown type).

## Notes for reviewers

- **Why a third `onError` argument instead of `onTimeout` / `onDisconnected`.** Desktop does not add a callback here: it feeds `RespNotConnected` through the same response handler. Doing the same gives every existing `onError` call site a terminal outcome without being touched, and `onResponseCode[RespNotConnected]` still takes precedence, as desktop's switch statements do. The extra argument is backward compatible and lets the few callers that care (login, register, join game, the UI copy) tell `Timeout` from `Disconnected` from `NotSent`. Separate callbacks would have needed an opt-in at every call site to get totality.
- **Commands sent without options stay fire-and-forget.** Their response is ignored and so is their failure; the deadline only cleans up the pending map. Unanswered keepalive pings used to accumulate there forever.
- **Pending commands fail on `RECONNECTING`, not only `DISCONNECTED`.** The reconnect opens a fresh server session, so they can never be answered. A login in flight when the socket drops settles the form without overwriting the status. The existing reconnect then still ends in "Connection lost — please log in again". The `connection.spec.ts` RECONNECTING test now logs in first, and a new test covers the in-flight login.
- **New `IWebClientResponse` callbacks are optional** (like `updateConnectionHealth`), so external consumers keep compiling.
- **Folded into #12's `commandFailed`.** The pre-rebase `viewLogsFailed` callback and its dialog are gone. Log search reports through `IModeratorResponse.commandFailed` and shows its error only on the Logs page. #12's commands that pass a bare `onFailure` as `onError` (`resetUserPassword`, `report`, `reportAddComment`, `setCardArtParams`) now settle with `RespNotConnected` on a timeout or disconnect, but their callers do not yet show the reason; that is a follow-up.
- **Not done here.** Desktop heals a `RespContextError` room join by leaving and rejoining. This branch only shows desktop's message for that code. `REPORT_RESOLVED` / `REPORT_COMMENT` are in the generated enum now, but report notices belong to W3 per the parity matrix, so `ServerNotices` still skips them. Desktop shows them as a tray popup, which would map to a toast. There is no boundary above `AppShell`'s providers, so a crash in the notifiers or `ToastProvider` itself is not contained. The OBS-001 redacting diagnostics layer is out of scope; boundaries log the error object and component stack only.
- **UI dismissal never writes server state.** `ServerNotices` tracks dismissed notifications by message identity in local state, so the UI never writes the server slice.

## Review response (rv2)
- **major: pending commands leak across `connect()`** → fixed (`fix(transport): fail pending commands when connect() replaces a socket`). `WebClient.connect()` calls `protobuf.resetCommands()` first, as desktop's `doConnectToServer` calls `doDisconnectFromServer`. There is an integration test: a login in flight, then `connect()`, then 18 s pass, and the status is untouched with only one outcome.
- **major: a salt request in flight during a drop cancels the reconnect** → fixed (`fix(transport): keep reconnecting when a salt request is cut off`). `requestPasswordSalt` passes the `CommandFailure` to `onFailure`. The login, activation and password-reset callers settle their form but skip `disconnect()` on `Disconnected`, matching login/register/activate. Covered by unit specs for all three callers and a `connection.spec.ts` case with a salt-advertising server.
- **major: every JOIN_ROOM_FAILED opens a dialog** → fixed (`fix(webatrice): show join-room failures only for user-initiated joins`). `joinRoom(roomId, userInitiated = true)` mirrors desktop's `setCurrent`. The `Event_ListRooms` autojoin passes `false`, and the flag rides through `joinRoomFailed` into a new `JoinRoomFailedPayload`. `CommandFailureNotices` skips autojoin failures and drops its queue (and shows nothing) while the status is DISCONNECTED.
- **Commit hygiene** → done. `58b4116` was split: its `ProtobufService.spec.ts` hunk went into the first commit and its `moderator.spec.ts` hunk into the commandFailed commit. `9d488d1` was folded into the deck/room/game-create failures commit. The per-commit check found one more red spot: the first commit failed four of the protocol branch's `onError` specs until the commandFailed commit changed `testing/callback-helpers.ts`, so that hunk moved into the first commit too. Every commit now builds, typechecks and passes the sockatrice unit and integration suites. The optional changeset moves were not done.
- The minor and nit findings (exception-safe settle loop and `dispose()`, a derived/configurable deadline, the ContextError heal, localising join-game reasons, autosave through `request.session.deckUpload`, "Return to lobby" on `/server`, the AlertDialog `OK` label, the transport instructions section, the remaining changeset gaps, the constant-only spec, a monotonic `cmdId`, the login Timeout note, the warning severity, the "Try again" label, and reusing `CommandFailedPayload`) were not in this fix task's scope and are left for a later pass.

## Restack notes (wR1)

- Join-room failures: #11 makes the lobby dialog the one surface and keeps this PR's `userInitiated` review fix end to end (autojoin silent); this PR's global join notice is removed there, its drop-on-disconnect fix stays.
- 04 @7e1fe97 sockatrice WebClientResponse.ts + mock: kept 03's session commandFailed and 04's deckList/Download/UploadFailed side by side
- 04 @dc2c709 webatrice useDeckEditor.spec.tsx (add/add with 02's deck-id re-seed spec): kept 02's file, moved 04's failure suite to useDeckEditor.failures.spec.tsx
- 04 @f7e1efa WebClientResponse.ts/server.actions.ts: kept 03's sessionCommandFailed; moderator/admin payloads take 04's CommandFailedPayload (failure?); merged the commandFailed doc
