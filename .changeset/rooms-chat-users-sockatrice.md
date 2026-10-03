---
'@cockatrice/sockatrice': minor
---

Room and chat commands now report their failures the way desktop handles them.

**Joining a room.** `joinRoom(roomId, userInitiated = true)` mirrors desktop `TabServer::joinRoom`: `joinRoomFailed` is reported only for joins a user asked for (auto-joins from `Event_ListRooms` fail silently), a join for a room already being joined is folded into the pending one, and a `RespContextError` (the server still counts you as a member) is healed once by leaving and rejoining before it is reported.

**Room chat flood.** `roomSay` reports a `RespChatFlood` rejection through the new `IRoomResponse.roomSayFlooded(roomId, message)` with the unsent text, mirroring desktop `TabRoom::sayFinished`.
