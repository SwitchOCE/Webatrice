---
'@cockatrice/datatrice': minor
---

New `server/moderatorCommandFailed` and `server/adminCommandFailed` signal actions carry failed moderator/admin commands to the UI, and `server.Selectors.getWarnListForUser` returns the official warning reasons Servatrice offered for a user. `adjustMod` now also refreshes the user's profile snapshot, so an open profile shows the new role.
