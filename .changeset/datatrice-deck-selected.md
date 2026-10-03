---
'@cockatrice/datatrice': minor
---

The games slice now stores the deck Servatrice returns for the local player's deck selection (`deckSelected` → `PlayerEntry.deckList`, action type `games.Types.DECK_SELECTED`). A client can show the loaded deck and edit its sideboard plan before the game starts, as desktop does.
