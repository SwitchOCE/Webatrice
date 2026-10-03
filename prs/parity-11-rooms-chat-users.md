# feat(rooms,chat,users): desktop-parity room joins, room and private chat feedback, and "Show this user's games"

> **Stacks on parity/10-account-auth** (`4e0ca01`, which sits on #04 command outcomes → #12 moderation → #03 3.1 protocol → #02 → #01). Review and merge after #10.

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
  - Join and spectate (plus the judge variants) go through the join flow that `GamesList` now shares (`useJoinGame`): password prompt, full game joined as a spectator, server errors. As on desktop, the user must join the game's room first.

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

Run on the rebased tip after `git submodule update` (vendor at `add65ca`) and `npm ci`, with Vitest capped at `--maxWorkers=2` because the shared host is short on memory.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npx turbo run lint --concurrency=1`: 3/3 tasks pass, 0 errors.
- Unit tests:
  - sockatrice: 763 passed (39 files).
  - datatrice: 1176 passed (27 files).
  - webatrice: 1402 passed, 2 skipped (190 files + 2 skipped; both skips were already there).
- Integration tests:
  - sockatrice: 159 passed (18 files).
  - datatrice: 132 passed (8 files).
  - webatrice: 156 passed, 2 skipped (35 files + 2 skipped).
- Some steps aborted with V8 out-of-memory (`Zone Allocation failed`, `DataCloneError`) while other agents loaded the host. The gate script waits for free memory and retries only those aborts, never a test failure.
- Only the branch tip was gated in full. Commit `c1e3fa8` (shared join flow) has one spec type error, which `900ed97` fixes; it existed before the rebase as well.
- New integration coverage:
  - Websocket round trips for a rejected, auto-joined and healed `Command_JoinRoom`, flood on `Command_RoomSay`, ignored-sender filtering (live and history), and each `Command_Message` rejection.
  - Feature round trips for the lobby join-error dialog, a PM to a partner who went offline (notice, draft restored, presence), and Show games (list, password join, routing, ignored error).
  - Unit specs cover every transport-failure path, the join de-duplication, and the slot composition (`UserGamesProvider.spec.tsx`). One of those slot specs checks that the selector survives the row unmounting.
- E2E: run under the e2e mutex against Servatrice 3.0.0 (default image) on the rebased tip. `e2e/specs/user-games-and-private-chat.spec.ts` and `login-join-room.spec.ts` passed **9/9** in 1.7 min across chromium, firefox and webkit, and Playwright exited 0.
  - Show games: the user-menu entry, now in the slot, lists another user's game and joins it, and the dialog closes.
  - Private chat to a partner who goes offline: "has left the server", the Offline state, the composer explains, Send is disabled, and the draft is kept.
  - Containers and volumes were torn down and the lock was released.
  - Before the rebase, the full suite passed 24/24. It was not repeated in full after the rebase.

## Notes for reviewers

- **One join-room failure surface.** #04 added a `rooms/joinRoomFailed` signal and a join-room entry in the global `CommandFailureNotices`, while this branch had a lobby dialog. The signal is now a slice reducer feeding `rooms.joinRoomError` (`{ roomId, responseCode, failure? }`, #04's payload shape). The lobby dialog is the single surface, using desktop's mapping plus #04's `useCommandFailureMessage`. The join-room handler, its i18n keys and its spec cases were removed from `CommandFailureNotices`; its create-game and deck-upload notices are unchanged.
- **New response hooks are optional.** Following #04, `roomSayFailed?`, `privateMessageFailed?`, `getGamesOfUserPending?` and `getGamesOfUserFailed?` are optional, and each takes the transport `failure?` last. Existing `IWebClientResponse` implementations keep compiling. The pre-rebase `roomSayFlooded` became `roomSayFailed(roomId, message, responseCode, failure?)` because it now reports more than flooding. Payloads use #04's `responseCode` / `failure` naming. Sockatrice and Datatrice are still `minor` (new behaviour and state).
- **`pendingRoomJoins`** lives in its own module, outside the session-commands barrel, so it never appears on `request.session`. `_resetAll()` clears it, and so do the mocked unit specs.
- **Show games through the slot.** `UserMenuSlot` holds a single component. `UserGamesProvider` therefore reads the slot it is mounted inside (the moderation widget's) and provides a composite: its entry, then theirs. The only shared-hub edits are one `AppShell` line and the `@app/feature-widgets/user-games` alias in `tsconfig.json` / `vite.config.ts`. The pre-rebase version kept the dialog's open state in each `UserDisplay` row, so a virtualized row scrolling away closed it; hosting it in the provider fixes that.
- **Ignore filtering is on arrival, not in a selector.** This matches desktop both ways: ignoring someone leaves their earlier lines in place, and un-ignoring does not bring back dropped lines. Inbound `addMessage` now goes through a `rooms/roomSayReceived` listener, and `ADD_MESSAGE` still fires for every stored message. Branch #19 hides ignored senders at render time; it should adapt to this when it rebases.
- **Draft restore is a small extension.** Desktop restores the PM draft only for `RespNameNotFound` and clears the room input on flood. Here every reported failure puts the text back, but only into an empty input. This follows the matrix acceptance for PLAT-021 and PLAT-022. Desktop ignores `RespChatFlood` for PMs even though `cmdMessage` returns it, so it is reported here with desktop's room flood wording. Other server rejections of `RoomSay` and `Message` stay silent, as on desktop.
- **Pre-send checks.** Desktop appends "Message not sent — X is offline." or "You have ignored X…" to the chat after a send attempt. Here the composer states the reason up front and disables Send, so nothing local has to be written into server state. A server-side `RespNameNotFound` (the partner left while the message was in flight) still adds desktop's notice to the conversation.
- **PM notices live next to `server.messages`, not inside it.** `privateChatNotices[name]` stores each notice's position among the messages, and the position shifts when the 1000-message cap trims the head. `messages` and `getPrivateMessagesForUser` are unchanged, so `PrivateMessageNotifier` and #19's notifications keep working.
- **Game types in `gamesOfUser` now resolve per room.** The old reducer merged every room's game types into one map, so one room's type id could shadow another's. Room names come from the rooms slice (`Event_ListRooms`).
- **`GamesList` refactor.** Its inline join flow moved into `hooks/useJoinGame.ts` (`useJoinGame` and `useNavigateOnGameJoined`), and the restrictions/spectators cell text moved into `utils/gameInfo.ts`. Behaviour is unchanged. GAME_JOINED routing is deduplicated per action, so the games dialog open over a room's list never pushes the game route twice. The unused legacy `GameSelector.tsx` was left alone.
- **Left out.** The desktop chat settings "ignore unregistered users" and "show room history" belong to #19. The "servatrice" sender locking the PM input was not ported. The games dialog is a snapshot, as on desktop: it is not subscribed to room events.
