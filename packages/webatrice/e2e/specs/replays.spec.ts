import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { GamePage } from '../pages';
import { ReplaysPage } from '../pages/ReplaysPage';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

// Replay parity (LONG-001..004): play a short real game, find it in the
// server replay storage, exercise the remote actions, then watch it and step
// through the timeline. Needs the e2e Servatrice to store replays
// (`store_replays=true` in docker/servatrice/servatrice-e2e.ini).
//
// Set REPLAY_FIXTURE_OUT to a path to keep the downloaded .cor (that is how
// src/services/replay/__fixtures__/two-player-game.cor was captured).

const DECK_PATH = resolve(__dirname, '..', 'fixtures', 'decks', 'forest-60.cod');

test('a finished game can be found, managed and watched from the replays tab', async ({ browser }) => {
  test.setTimeout(240_000);
  const hostCtx = await browser.newContext({ acceptDownloads: true });
  const joinerCtx = await browser.newContext();

  try {
    const hostPage = await hostCtx.newPage();
    const joinerPage = await joinerCtx.newPage();
    const [host, joiner] = await Promise.all([
      registerAndJoinFirstRoom(hostPage),
      registerAndJoinFirstRoom(joinerPage),
    ]);

    // ---- Play a short game ----
    const gameName = `replay-${randomSuffix()}`;
    await host.rooms.createGame(gameName, { maxPlayers: 2 });
    const hostGame = new GamePage(hostPage);
    await joiner.rooms.joinGame(gameName);
    const joinerGame = new GamePage(joinerPage);
    await Promise.all([hostGame.loadDeck(DECK_PATH), joinerGame.loadDeck(DECK_PATH)]);
    await Promise.all([hostGame.setReady(), joinerGame.setReady()]);
    await Promise.all([hostGame.waitForBoard(), joinerGame.waitForBoard()]);
    await hostGame.drawCard();
    await hostGame.endTurn();
    await hostGame.leaveGame();
    await joinerGame.deckSelect.waitForOpen();
    await joinerGame.deckSelect.leaveGame();
    await expect(joinerGame.container).toBeHidden({ timeout: 30_000 });

    // ---- Server replay storage (LONG-001) ----
    const replays = new ReplaysPage(hostPage);
    await replays.open();
    const match = replays.matchRow(gameName);
    await expect(match).toBeVisible({ timeout: 30_000 });
    await expect(match).toContainText(host.user.username);
    await expect(match).toContainText(joiner.user.username);

    const replayRow = await replays.expandMatch(gameName);
    await replayRow.click();

    // ---- Remote actions (LONG-004) ----
    const download = await replays.downloadSelected();
    expect(download.suggestedFilename()).toMatch(/^replay_\d+\.cor$/);
    if (process.env.REPLAY_FIXTURE_OUT) {
      await copyFile(await download.path(), process.env.REPLAY_FIXTURE_OUT);
    }

    await match.click();
    await replays.serverAction('Toggle expiration lock').click();
    await expect(match.locator('[data-testid^="replay-locked-"]')).toBeVisible();

    await replays.serverAction('Get replay share code').click();
    const shareDialog = hostPage.getByRole('dialog').filter({ hasText: 'Replay Share Code' });
    await expect(shareDialog.getByTestId('replay-share-code')).toHaveText(/\S+/);
    await shareDialog.getByRole('button', { name: 'OK' }).click();

    await replays.serverAction('Save to local replays').click();
    await expect(replays.localPane.getByText(/^replay_\d+\.cor$/)).toBeVisible();

    // ---- Playback (LONG-002) ----
    await replayRow.dblclick();
    await expect(replays.controls).toBeVisible({ timeout: 30_000 });
    await expect(replays.log).toContainText('You are watching a replay of game #');
    await expect(replays.time).toHaveText(/^0:00 \/ \d+:\d\d$/);

    // Step forward until both players have joined the recorded game.
    for (let i = 0; i < 3; i++) {
      await hostPage.getByRole('button', { name: 'Skip forward 10 seconds' }).click();
    }
    await expect(replays.log).toContainText(`${joiner.user.username} has joined the game.`);
    await expect(replays.time).not.toHaveText(/^0:00 /);

    // Seeking back rebuilds the game from the start: the join lines are gone.
    await replays.seekToFraction(0);
    await expect(replays.time).toHaveText(/^0:00 /);
    await expect(replays.log).not.toContainText('has joined the game.');

    // Fast-forward playback runs to the recorded end.
    await hostPage.getByRole('button', { name: /^Fast forward/ }).click();
    await hostPage.getByRole('button', { name: 'Play' }).click();
    await expect(replays.log).toContainText('The game has been closed.', { timeout: 60_000 });
    await expect(hostPage.getByRole('button', { name: 'Play' })).toBeVisible();

    // Close returns to the replays tab.
    await hostGame.rightPanel.getByRole('button', { name: /^close$/i }).click();
    await expect(replays.serverPane).toBeVisible();

    // ---- Delete with confirmation ----
    await replays.matchRow(gameName).click();
    await replays.serverAction('Delete').click();
    const confirm = hostPage.getByRole('dialog').filter({ hasText: 'Delete remote replay' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(replays.matchRow(gameName)).toHaveCount(0);
  } finally {
    await hostCtx.close();
    await joinerCtx.close();
  }
});
