---
'@cockatrice/sockatrice': minor
---

`deckSelect` now reads Servatrice's `Response_DeckDownload` and passes the server's copy of the deck to the new optional `IGameResponse.deckSelected(gameId, deckList)` callback. A rejected or unanswered deck select reaches the new optional `IGameResponse.deckSelectFailed(gameId, responseCode, failure?)`. Desktop builds its pre-game deck view and sideboard editor from that string, and clients now have it too. `WebClient.connectTarget` exposes the host and port of the last connection, so a client can build a desktop `cockatrice://joingame` link for the server it is on.
