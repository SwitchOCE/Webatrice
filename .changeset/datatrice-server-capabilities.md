---
'@cockatrice/datatrice': minor
---

Server capability gating, login rejection codes and the 3.1 protocol events.

`server.Selectors.supports(state, server.ServerCapability.X)` tells whether the connected Servatrice offers a 3.1 feature family (`REPORTS`, `MODERATION_TOOLS`, `CARD_ART`, `PLAYMATS`, `DECK_SHARING`, `DEVELOPER_ROLE`), inferred from the version string it identifies with, since the protocol has no feature list and `protocol_version` is 14 on both 3.0 and 3.1. Unknown versions answer `false`. `parseServerVersion` and `serverSupports` are exported for non-store callers.

`loginFailed` now records the rejecting response code in `server.loginFailureCode` (`getLoginFailureCode`), cleared on the next connection attempt and kept through the disconnect that follows a rejected login. `Event_GameLogNotice` `UNDO_DRAW_FAILED` appends desktop's "<player> failed to undo their last draw." to the game log; unknown notice types are dropped. `adjustMod` leaves a role unchanged when its flag is omitted, as Servatrice does (promoting to moderator no longer clears judge locally), and applies the new developer flag; new `getIsUserDeveloper` selector.
