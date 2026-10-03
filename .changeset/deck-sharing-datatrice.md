---
'@cockatrice/datatrice': minor
---

Stores Cockatrice 3.1 deck sharing (#7241). The server slice keeps the caller's share links (`deckSharesMine`, selector `getDeckSharesMine`, emptied by `deckShareRemoved`) and other users' public deck trees (`publicDecks`, selector `getPublicDecks(state, userName)`). A visibility change updates the stored deck tree's public bit for the deck or folder. New signal actions `deckShareCreated`, `deckShareListed`, `deckShareDownloaded`, `publicDeckDownloaded` and `deckSharingFailed` (command, target, response code, transport reason) report the one-off answers.
