---
'@cockatrice/datatrice': minor
---

Store the results of the Cockatrice 3.1 staff tools.

`attachResponseHandlers` now implements the moderator investigation, card-art rule and developer responses. `server.staff` holds per-user investigations (`ReportUserInfo`, alts, sessions), staff last logins, card-art rules and the latest server stats snapshot, read through `getUserInvestigation`, `getModeratorLastLogins`, `getCardArtRules` and `getServerStats` (lists are `null` until loaded). `userAvatarRemoved` drops the cached avatar of that user. A password reset's temporary password never enters the store.
