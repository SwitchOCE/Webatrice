---
'@cockatrice/datatrice': minor
---

Replay games in the games slice.

`games.Actions.replayGameLoaded({ gameId, gameInfo })` creates (or, for a rewind, resets) a local game a replay is played back into: no local player, an omniscient spectator, flagged `replay: true`, with desktop's "You are watching a replay of game #N." log line. `replayGameUnloaded({ gameId })` removes it. Replay games survive `clearStore` and disconnects, stay on the board with "The game has been closed." when the recorded `Event_GameClosed` arrives, never raise the incoming-reveal dialog, and are left out of `getActiveGameIds` / `getActiveGames` so they get no game tab. New `getIsReplayGame` selector.
