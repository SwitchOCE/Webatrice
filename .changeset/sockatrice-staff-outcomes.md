---
'@cockatrice/sockatrice': minor
---

Staff commands report failures through `commandFailed`.

The Cockatrice 3.1 staff lookups (`reportUserInfo`, `getUserAlts`, `getUserSessions`, `getModeratorLastLogins`, `removeUserAvatar`, `listCardArtRules`) report a failure through `IModeratorResponse.commandFailed`, and `updateServerMessage`, `shutdownServer` and `reloadConfig` through `IAdminResponse.commandFailed`, with the transport reason when the server never answered. `IDeveloperResponse` gains an optional `commandFailed` for `getServerStats`, and `DeveloperCommandName` is exported. `resetUserPassword`'s `onFailure` also receives the transport reason.
