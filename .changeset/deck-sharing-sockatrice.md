---
'@cockatrice/sockatrice': minor
---

Deck share and public-deck commands now report failures. A rejected or unanswered `deckShareCreate`, `deckShareList`, `deckShareDownload`, `deckShareListMine`, `deckShareRemove`, `deckListOtherUser`, `deckSetVisibility` or `deckDownloadPublic` calls the new optional `ISessionResponse.deckSharingFailed(command, responseCode, target, failure?)`, so a client can show desktop's "server response code" messages. `DeckSharingCommandName` is exported from `@cockatrice/sockatrice/types`.
