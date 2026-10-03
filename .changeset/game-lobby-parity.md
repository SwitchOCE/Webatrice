---
'@cockatrice/webatrice': minor
---

The pre-game lobby now follows desktop's deck view. Once a deck is loaded it shows the Maindeck and Sideboard with Unload deck, Ready to start, a Sideboard locked/unlocked toggle and, for the host, Force start. While the sideboard is unlocked and you are not ready, clicking a card moves it between Maindeck and Sideboard and sends your sideboard plan, both before the first game and between games. Force start asks for confirmation and then sends a single force-start ready command, so the server removes unready players and starts the game in one step instead of the lobby kicking each player.
