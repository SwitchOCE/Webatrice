---
'@cockatrice/sockatrice': minor
---

Room and chat commands now report their failures the way desktop handles them, with #04's `CommandFailure` reason when the server never answered. Every new `IWebClientResponse` callback is optional, so existing implementations keep compiling.

**Joining a room.** `joinRoom(roomId, userInitiated = true)` mirrors desktop `TabServer::joinRoom`: `joinRoomFailed` keeps #04's `userInitiated` flag (auto-joins from `Event_ListRooms` report `false`), a join for a room already being joined is folded into the pending one, and a `RespContextError` (the server still counts you as a member) is healed once by leaving and rejoining before it is reported.

**Room chat.** `roomSay` reports a `RespChatFlood` rejection (desktop `TabRoom::sayFinished`), or a message the server never answered, through the new `IRoomResponse.roomSayFailed?(roomId, message, responseCode, failure?)` with the unsent text.

**Private messages.** `message` reports `RespInIgnoreList`, `RespNameNotFound` and `RespChatFlood` rejections (desktop `TabMessage::messageSent`), or a message the server never answered, through the new `ISessionResponse.privateMessageFailed?(userName, message, responseCode, failure?)` with the unsent text.
