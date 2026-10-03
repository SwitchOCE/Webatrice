---
'@cockatrice/datatrice': patch
---

"X reversed turn order" now names the player who reversed it rather than the active player. `GameResponseImpl.turnReversed` forwards the new optional `playerId` into the `turnReversed` action, and the message-log listener falls back to the active player only when the event carries no actor.
