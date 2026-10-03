---
'@cockatrice/datatrice': minor
---

Room and chat state for desktop-parity failure feedback.

**Room join failures.** `rooms.joinRoomFailed` is now a slice reducer: `rooms.joinRoomError` (`{ roomId, responseCode, failure? }`) holds the failed join for the lobby's dialog, read with `rooms.Selectors.getJoinRoomError` and cleared with `rooms.Actions.clearJoinRoomError`.

**Room chat.** Messages from users on your ignore list are dropped as they arrive, history included, as desktop `TabRoom::processRoomSayEvent` does (inbound `addMessage` now goes through a `rooms/roomSayReceived` listener). A flood rejection appends a client notice line (`Message.notice === 'chatFlood'`) and dispatches `rooms.Actions.roomSayFlooded` with the unsent text.

**Private conversations.** `server.privateChatNotices` records lines desktop `TabMessage` appends to a conversation: a rejected message (recipient ignores you, recipient offline, flooding) and the partner leaving or rejoining the server while a conversation is open. `server.Selectors.getPrivateConversation(state, name)` returns messages and notices in order; `server.Selectors.getIsUserOnline(state, name)` exposes known presence. `server.Actions.privateMessageFailed` carries the unsent text.
