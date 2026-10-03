---
'@cockatrice/datatrice': minor
---

Room and chat state for desktop-parity failure feedback.

**Room join failures.** `rooms.joinRoomFailed` is now a slice reducer: `rooms.joinRoomError` (`{ roomId, responseCode, failure? }`) holds the failed join for the lobby's dialog, read with `rooms.Selectors.getJoinRoomError` and cleared with `rooms.Actions.clearJoinRoomError`.
