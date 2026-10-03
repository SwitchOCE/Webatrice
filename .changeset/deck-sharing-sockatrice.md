---
'@cockatrice/sockatrice': patch
---

Deck share and public-deck command failures now carry the transport failure too. A `deckShareCreate`, `deckShareList`, `deckShareDownload`, `deckShareListMine`, `deckShareRemove`, `deckListOtherUser`, `deckSetVisibility` or `deckDownloadPublic` that times out or cannot be sent passes its `CommandFailure` as the fourth argument of `ISessionResponse.commandFailed`, as the staff scopes already do.
