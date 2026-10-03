# feat(rooms,chat,users): desktop-parity room joins, room and private chat feedback, and "Show this user's games"

> **Stacks on parity/10-account-auth** (the review-fixed `claude/parity-10-account-auth` at `4119363`, which sits on #04 command outcomes → #12 moderation → #03 3.1 protocol → #02 → #01). Review and merge after #10.

## Summary

- **Room permissions (PLAT-017).** The rooms table shows a room's privilege level when its permission level is `none`, via a shared `getRoomPermissionDisplay` that mirrors `RoomSelector::getRoomPermissionDisplay`, including its quirk that an empty permission level hides the privilege level.
- **Room join failures (PLAT-018).** This is now the one join-room failure surface; #04's generic join-room notice is folded into it. `joinRoom(roomId, userInitiated)` follows `TabServer::joinRoom` / `joinRoomFinished`:
  - A join for a room already being joined is folded into the pending one (`pendingRoomJoins`). This is safe now because #04 settles every command on timeout or disconnect.
  - A `RespContextError` is healed once by leaving and rejoining.
  - Auto-joins fail silently, like desktop's `setCurrent=false` joins.
  - A failed join the user asked for lands in `rooms.joinRoomError`, and the lobby shows desktop's message for each code. When the server never answered, it shows #04's timed-out / connection-lost reason instead. The user stays in the lobby and can retry.
- **Room chat (PLAT-021).**
  - Messages from ignored senders are dropped when they arrive, history lines included (`TabRoom::processRoomSayEvent`). This runs in a Datatrice listener because the ignore list lives in the server slice.
  - `RespChatFlood` adds desktop's "You are flooding the chat" line. A message the server never answered adds "Message not sent: <reason>". Either way the unsent text goes back into an empty input.
  - History lines show `[d MMM yyyy HH:mm:ss]` from `time_of` after the sender's name.
- **Private messages (PLAT-022).**
  - `message` reports `RespInIgnoreList`, `RespNameNotFound`, `RespChatFlood` and unanswered sends (#04's `CommandFailure`), each with the unsent text.
  - Datatrice keeps the notices desktop's `TabMessage` appends (the failure, and the partner leaving or rejoining the server) next to the messages. `getPrivateConversation` merges them in order.
  - The chat shows the partner's online state and puts failed text back into an empty composer. Like desktop, it does not send while the partner is offline or on your ignore list, and it keeps the draft.
- **Show this user's games (PLAT-025 / LONG-022).**
  - A new `feature-widgets/user-games` widget adds the entry to #12's `UserMenuSlot` (user lists and chat name links), ahead of the moderation section that already fills the slot.
  - The entry is enabled while the user is online. `UserGamesProvider` hosts the selector above the routes, so it outlives the menu and the virtualized row that opened it.
  - The selector has no filters and no create button, like desktop's `GameSelector(room=nullptr)`. It has loading, empty, desktop-failure and transport-failure states, and a room column.
  - Join and spectate (plus the judge variants) go through the join flow that `GamesList` now shares (`useJoinGame`): password prompt, full game joined as a spectator, server errors. As on desktop, the user must join the game's room first. Desktop asks "The game is full. Join as a spectator instead?" before spectating a full game; the shared flow (like `GamesList` before it) spectates without asking, so that step is not parity yet.
  - Rows form an ARIA grid with a roving tabindex: arrows, Home and End move the selection, Space selects, Enter joins.
  - A rejected join is shown only by the list that sent it, so the dialog and the room's `GamesList` underneath never both show it.

## Parity rows closed

PLAT-017, PLAT-018, PLAT-021, PLAT-022, PLAT-025, LONG-022. PLAT-023 (desktop notifications) is left to the settings branch (#19) on purpose.

## Desktop reference

- `cockatrice/src/interface/widgets/tabs/tab_server.cpp`: `RoomSelector::getRoomPermissionDisplay`, `TabServer::joinRoom` (`pendingRoomJoins`), `joinRoomFinished`, `leaveAndRejoinRoom`
- `cockatrice/src/interface/widgets/tabs/tab_room.cpp`: `sendMessage`, `sayFinished`, `processRoomSayEvent`
- `cockatrice/src/interface/widgets/tabs/tab_message.cpp`: `sendPrivateMessage`, `sendMessage`, `messageSent`, `processUserLeft`, `processUserJoined`, `notifyUserOffline`
- `cockatrice/src/interface/widgets/server/user/user_context_menu.cpp`: `execShowGames`, `gamesOfUserReceived`, the `aShowGames` enablement
- `cockatrice/src/interface/widgets/server/game_selector.cpp`: `joinGame`, `checkResponse`, `enableButtonsForIndex`
- `libcockatrice_network/.../server_protocolhandler.cpp`: `cmdMessage`, `cmdRoomSay`, `cmdGetGamesOfUser` (response codes)

## Testing

Run on the final tip `0491a03` after `git submodule update` and `npm ci`, with Vitest capped at `--maxWorkers=2`.

- Every commit in the rewritten range passes `npx turbo run typecheck --concurrency=1` (5/5), checked with `git rebase -x`. The fix commits were typechecked as part of the tip gate.
- `npm run lint`: 3/3, 0 errors.
- Unit tests:
  - sockatrice: 771 passed (39 files).
  - datatrice: 1176 passed (27 files).
  - webatrice: 1409 passed, 2 skipped (190 files + 2 skipped; both skips were already there).
- Integration tests:
  - sockatrice: 159 passed (18 files).
  - datatrice: 132 passed (8 files).
  - webatrice: 157 passed, 2 skipped (35 files + 2 skipped). This includes the new disconnect test in `integration/src/websocket/rooms.spec.ts`.
- `npm run test:e2e -w @cockatrice/sockatrice`: 5/5 (4 files), Servatrice 3.0.0.
- `npm run test:e2e -w @cockatrice/webatrice`, Servatrice 3.0.0, on the full suite: **26/30** passed.
  - chromium 8/10, firefox 9/10, webkit 9/10. WebKit first needed `playwright install-deps webkit`, then I re-ran it as its own project.
  - All of these passed on every browser: `account-self-service`, `user-games-and-private-chat` (both tests), `login-join-room`, `game-create-and-play`, `spectator`, `moderation-room-user` and `connection-stability`.
  - Four tests failed: `app-boots` on chromium (`ERR_CERT_AUTHORITY_INVALID` from an external host through the egress proxy) and `bulk-card-actions` on all three browsers. I ran those two specs on the original PR tip `a6642c3` and they fail the same way there (4 failed, 2 passed), so this branch did not cause them. The hermetic e2e fixture isn't in this base.

## Notes for reviewers

- **One join-room failure surface.** #04 added a `rooms/joinRoomFailed` signal and a join-room entry in the global `CommandFailureNotices`, while this branch had a lobby dialog. The signal is now a slice reducer feeding `rooms.joinRoomError` (`{ roomId, responseCode, failure? }`, #04's payload shape). The lobby dialog is the single surface, using desktop's mapping plus #04's `useCommandFailureMessage`. The join-room handler, its i18n keys and its spec cases were removed from `CommandFailureNotices`; its create-game and deck-upload notices are unchanged.
- **New response hooks are optional.** Following #04, `roomSayFailed?`, `privateMessageFailed?`, `getGamesOfUserPending?` and `getGamesOfUserFailed?` are optional, and each takes the transport `failure?` last. Existing `IWebClientResponse` implementations keep compiling. The pre-rebase `roomSayFlooded` became `roomSayFailed(roomId, message, responseCode, failure?)` because it now reports more than flooding. Payloads use #04's `responseCode` / `failure` naming. Sockatrice and Datatrice are still `minor` (new behaviour and state).
- **`pendingRoomJoins`** lives in its own module, outside the session-commands barrel, so it never appears on `request.session`. `_resetAll()` clears it, and so do the mocked unit specs.
- **Failures after a disconnect.** On DISCONNECTED the response layer resets every slice before Sockatrice fails the in-flight commands as `Disconnected`. `roomSay`, `message`, `joinRoom` and `getGamesOfUser` skip a `Disconnected` failure once the client status is DISCONNECTED (`commands/outlivedSession.ts`), so nothing from the ended session lands in the next one. Failures while RECONNECTING are still reported. I did not move `resetCommands()` ahead of the status hand-off: a login callback failed by that reset sets a more specific DISCONNECTED description, and the generic "Connection Closed" would then overwrite it.
- **Show games through the slot.** `UserMenuSlot` holds a single component. `UserGamesProvider` therefore reads the slot it is mounted inside (the moderation widget's) and provides a composite: its entry, then theirs. The only shared-hub edits are one `AppShell` line and the `@app/feature-widgets/user-games` alias in `tsconfig.json` / `vite.config.ts`. The pre-rebase version kept the dialog's open state in each `UserDisplay` row, so a virtualized row scrolling away closed it; hosting it in the provider fixes that.
- **Ignore filtering is on arrival, not in a selector.** This matches desktop both ways: ignoring someone leaves their earlier lines in place, and un-ignoring does not bring back dropped lines. Inbound `addMessage` now goes through a `rooms/roomSayReceived` listener, and `ADD_MESSAGE` still fires for every stored message. Branch #19 hides ignored senders at render time; it should adapt to this when it rebases.
- **Draft restore is a small extension.** Desktop restores the PM draft only for `RespNameNotFound` and clears the room input on flood. Here every reported failure puts the text back, but only into an empty input. This follows the matrix acceptance for PLAT-021 and PLAT-022. Desktop ignores `RespChatFlood` for PMs even though `cmdMessage` returns it, so it is reported here with desktop's room flood wording. Other server rejections of `RoomSay` and `Message` stay silent, as on desktop.
- **Pre-send checks.** Desktop appends "Message not sent — X is offline." or "You have ignored X…" to the chat after a send attempt. Here the composer states the reason up front and disables Send, so nothing local has to be written into server state. A server-side `RespNameNotFound` (the partner left while the message was in flight) still adds desktop's notice to the conversation.
- **PM notices live next to `server.messages`, not inside it.** `privateChatNotices[name]` stores each notice's position among the messages, and the position shifts when the 1000-message cap trims the head. `messages` and `getPrivateMessagesForUser` are unchanged, so `PrivateMessageNotifier` and #19's notifications keep working.
- **Game types in `gamesOfUser` now resolve per room.** The old reducer merged every room's game types into one map, so one room's type id could shadow another's. Room names come from the rooms slice (`Event_ListRooms`).
- **`GamesList` refactor.** Its inline join flow moved into `hooks/useJoinGame.ts` (`useJoinGame` and `useNavigateOnGameJoined`), and the restrictions/spectators cell text moved into `utils/gameInfo.ts`. Behaviour is unchanged. GAME_JOINED routing is deduplicated per action, so the games dialog open over a room's list never pushes the game route twice. The unused legacy `GameSelector.tsx` was left alone.
- **Left out.** The desktop chat settings "ignore unregistered users" and "show room history" belong to #19. The "servatrice" sender locking the PM input was not ported. The games dialog is a snapshot, as on desktop: it is not subscribed to room events.

## Review response (rv3)
- **blocker, red commit `c1e3fa8`** → the `useJoinGame.spec.tsx` hunk from `900ed97` is folded into it (now `4417c62`). Every commit in the range passes `npx turbo run typecheck --concurrency=1` (checked with `git rebase -x`).
- **minor, late fixup `a6642c3`** → folded hunk by hunk into the commits that introduced each API: the `roomSayFailed`/`notSent` room-chat parts into the room-chat commit, the `privateMessageFailed`/`notSent` parts into the private-chat commit, the `getGamesOfUser*` failure parts into the request-lifecycle commit, and the dialog's transport reason into the Show games commit. The changesets were rewritten paragraph by paragraph to match. The rewritten tree is identical to the old tip plus PR 10's fixes. Commit messages now describe the API each commit ships.
- **major, duplicate join-error dialogs** → `ef71ebe`. `useJoinGame` records which instance sent the latest join, and only that instance reports `rooms.joinGameError`. An owner that unmounts clears the error. Specs with two mounted instances check that only the sender reports it, and that ownership moves to whichever list joined last.
- **major, failures stored after DISCONNECTED** → `b90dd6d`, by guarding the writers on status (reason above). There's an integration test where a socket error ends the session with `roomSay`, `message`, `joinRoom` and `getGamesOfUser` still pending; the store comes back clean. It failed before the fix. Unit specs cover each command's silent path, and the reconnecting path still reports.
- **major, keyboard access** → `0491a03`. An ARIA grid with a roving tabindex, with specs for the Tab stop, arrows, Space and Enter. The repo has no shared grid helper (`GamesList` is a `role="table"` with click-only rows), so the pattern lives in the dialog.
- Corrected claim: a full game is spectated without desktop's confirmation prompt (Summary).
- Not in this task's scope, left for a follow-up: room names from `Response_GetGamesOfUser.room_list`, the full-game spectate prompt, `overrideRestrictions` from user level, translating `gameInfo.ts` cell text, the presence line for an empty open chat, and the nits (`getGamesOfUserPending` naming, `<time dateTime>`, the menu separator role).

## Restack notes (wR1)

- Grid/keyboard (series decision): `useGridRows` (from #15) is introduced here in `@app/hooks` and used by UserGamesDialog; #13 CardArtRules, #15 replay lists, #14 report tables and #20 token/URL lists reuse it.
- 11 @9fde780 joinRoom (REDONE per orchestrator M1): 11's lobby dialog (rooms.joinRoomError) stays the one join-failure surface AND carries 04's review fix: sockatrice joinRoom always reports joinRoomFailed(roomId, code, failure, userInitiated) (heal path and outlived-session guard included), datatrice keeps 04's JoinRoomFailedPayload/RoomResponseImpl userInitiated, and 11's joinRoomError reducer ignores userInitiated=false (autojoin silent like desktop setCurrent=false). 04's specs restored (sockatrice unit + integration 'autojoin not user-initiated', RoomResponseImpl); new reducer + datatrice integration cases for the silent autojoin. 04's other review fix (CommandFailureNotices drops queued notices on DISCONNECTED) kept with its spec re-expressed on create-game/deck-upload failures. 04's changesets unchanged; 11's sockatrice/datatrice changesets say joinRoomFailed keeps userInitiated
- 11 @0491a03 (grid decision): added 15's useGridRows (+spec, hooks barrel) in this commit and rewrote UserGamesDialog's hand-rolled roving tabindex on it
