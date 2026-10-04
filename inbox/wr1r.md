# Inbox for wr1r

## M1 (00:48 UTC)

Extra item from rv16 (review of the 17a/17b port): the game-level double-click path autoPlayCard (playCard.ts, called from useGameArrowInteractions) and the hand→battlefield drag send no printed pt and no cipt tapped, unlike the menu/HandZone paths that go through playCardMove. You're rewriting that path, so route every play entry point through one helper that carries pt and tapped from card metadata, with specs. (f17 is applying the other rv16 findings on 17a/17b; you stay on 41f0d47.)
