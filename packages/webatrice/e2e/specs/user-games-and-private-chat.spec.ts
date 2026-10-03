import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { GamePage } from '../pages';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

// User context menu flows against a real Servatrice:
//   - "Show this user's games" lists another user's game and joins it
//     through the normal join flow.
//   - A private chat follows the partner going offline: the conversation
//     notes it, the composer explains why it can't deliver, and the draft
//     is kept instead of being sent.

// The Players Online panel (RoomUsers) renders a UserDisplay per online user.
function userRow(page: Page, name: string) {
  return page.locator('.user-display').filter({ hasText: name });
}

test('shows another user\'s games and joins one from the list', async ({ newContext }) => {
  test.setTimeout(120_000);
  const hostCtx = await newContext();
  const viewerCtx = await newContext();

  try {
    const hostPage = await hostCtx.newPage();
    const viewerPage = await viewerCtx.newPage();

    const host = await registerAndJoinFirstRoom(hostPage);
    await registerAndJoinFirstRoom(viewerPage);

    const gameDescription = `games-${randomSuffix()}`;
    await host.rooms.createGame(gameDescription, { maxPlayers: 2 });

    await userRow(viewerPage, host.user.username).click({ button: 'right' });
    await viewerPage.getByRole('menuitem', { name: /show this user's games/i }).click();

    const dialog = viewerPage.getByRole('dialog', { name: `${host.user.username}'s games` });
    await expect(dialog).toBeVisible();
    const row = dialog.getByRole('row').filter({ hasText: gameDescription });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.click();
    await dialog.getByRole('button', { name: /^join$/i }).click();

    // The join routes to the game and the selector closes.
    const viewerGame = new GamePage(viewerPage);
    await viewerGame.deckSelect.waitForOpen();
    await expect(dialog).toBeHidden();

    await viewerGame.deckSelect.leaveGame();
    const hostGame = new GamePage(hostPage);
    await hostGame.deckSelect.waitForOpen();
    await hostGame.deckSelect.leaveGame();
  } finally {
    await hostCtx.close();
    await viewerCtx.close();
  }
});

test('a private chat keeps the draft when the partner goes offline', async ({ newContext }) => {
  test.setTimeout(120_000);
  const senderCtx = await newContext();
  const partnerCtx = await newContext();

  try {
    const senderPage = await senderCtx.newPage();
    const partnerPage = await partnerCtx.newPage();

    await registerAndJoinFirstRoom(senderPage);
    const partner = await registerAndJoinFirstRoom(partnerPage);
    const partnerName = partner.user.username;

    // Open the Player page (which hosts the private chat) from the user list.
    await userRow(senderPage, partnerName).getByRole('link').click();
    const presence = senderPage.getByTestId('private-chat-presence');
    await expect(presence).toHaveText(/online/i, { timeout: 15_000 });

    const composer = senderPage.getByPlaceholder(`Message ${partnerName}`);
    await composer.fill('hello there');
    await senderPage.getByRole('button', { name: 'Send' }).click();
    await expect(senderPage.getByText('hello there')).toBeVisible();

    // The partner disconnects.
    await partnerCtx.close();

    await expect(senderPage.getByText(`${partnerName} has left the server.`)).toBeVisible({ timeout: 30_000 });
    await expect(presence).toHaveText(/offline/i);

    await composer.fill('are you still there?');
    await expect(senderPage.getByText(`${partnerName} is offline; messages cannot be delivered.`)).toBeVisible();
    await expect(senderPage.getByRole('button', { name: 'Send' })).toBeDisabled();
    await composer.press('Enter');
    await expect(composer).toHaveValue('are you still there?');
  } finally {
    await senderCtx.close();
    await partnerCtx.close().catch(() => {});
  }
});
