---
'@cockatrice/webatrice': minor
---

Rooms, chat and user-menu parity with desktop Cockatrice.

**Room permissions.** The rooms table shows a room's privilege level when its permission level is `none`, as desktop does, instead of always showing `none`.

**Room join errors.** A failed join is explained in the lobby with desktop's message (the room doesn't exist, you lack the permission, or an unknown error with its code), or with the timed-out / connection-lost reason when the server never answered, and leaves you there to retry. This replaces the generic join-room notice.
