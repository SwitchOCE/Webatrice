---
'@cockatrice/sockatrice': minor
---

Room and chat commands now report their failures the way desktop handles them.

**Joining a room.** `joinRoom(roomId, userInitiated = true)` mirrors desktop `TabServer::joinRoom`: `joinRoomFailed` keeps #04's `userInitiated` flag (auto-joins from `Event_ListRooms` report `false`), a join for a room already being joined is folded into the pending one, and a `RespContextError` (the server still counts you as a member) is healed once by leaving and rejoining before it is reported.
