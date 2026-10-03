---
'@cockatrice/sockatrice': minor
---

Add `deckUpdate(deckId, deckList)`, which replaces an existing deck in server storage (desktop's remote "Save deck"). It sends `Command_DeckUpload` with only `deck_id` and `deck_list`: Servatrice creates a new deck whenever `path` is present, even empty, which `deckUpload` always sets. The answer arrives through two new session response callbacks, `updateServerDeck(deckId, treeItem)` and `updateServerDeckFailed(deckId, responseCode, failure?)` (the same shape as the other deck command failures), which are optional members of `ISessionResponse`, so existing implementations still compile.
