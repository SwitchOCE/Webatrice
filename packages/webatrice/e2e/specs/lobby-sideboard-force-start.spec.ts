import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { GamePage } from '../pages';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

// Pre-game lobby parity (GAME-013 / GAME-014) against real Servatrice:
// the host loads a deck with a sideboard, unlocks it, swaps a card in
// before readying, then force-starts while the joiner never readied.
// Servatrice must kick the joiner and start the game in one step, and
// the host's library must reflect the sideboard plan.

const DECK_PATH = resolve(__dirname, '..', 'fixtures', 'decks', 'forest-island-side.cod');

test('sideboard swap before ready, then host force start kicks the unready player', async ({ browser }) => {
  test.setTimeout(180_000);
  const hostCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();

  try {
    const hostPage = await hostCtx.newPage();
    const joinerPage = await joinerCtx.newPage();

    const [host, joiner] = await Promise.all([
      registerAndJoinFirstRoom(hostPage),
      registerAndJoinFirstRoom(joinerPage),
    ]);

    const gameDescription = `e2e-force-${randomSuffix()}`;
    await host.rooms.createGame(gameDescription, { maxPlayers: 2, spectatorsAllowed: true });
    const hostGame = new GamePage(hostPage);
    await joiner.rooms.joinGame(gameDescription);
    const joinerGame = new GamePage(joinerPage);
    await Promise.all([hostGame.deckSelect.waitForOpen(), joinerGame.deckSelect.waitForOpen()]);

    // Host: deck-loaded state comes from the server's deck-select response.
    await hostGame.deckSelect.loadDeckFile(DECK_PATH);
    await hostGame.deckSelect.submitDeck();
    await expect(hostGame.deckSelect.deckView).toBeVisible();

    // Sideboarding before ready: unlock, move one Island into the maindeck.
    await hostGame.deckSelect.unlockSideboard();
    await hostGame.deckSelect.moveDeckCard('Island', 'side');

    // Force start: one ready+force_start command; the joiner never readied.
    await hostGame.deckSelect.forceStart();
    await hostGame.waitForBoard();

    // The plan applied server-side: 60 Forest + 1 Island in the library.
    await expect.poll(() => hostGame.zoneStackCount('deck'), { timeout: 15_000 }).toBe(61);

    // The unready joiner was kicked out of the game.
    await expect(joinerGame.deckSelect.lobby).toBeHidden({ timeout: 30_000 });
    await expect(joinerGame.container).toBeHidden();

    await hostGame.leaveGame();
  } finally {
    await hostCtx.close();
    await joinerCtx.close();
  }
});
