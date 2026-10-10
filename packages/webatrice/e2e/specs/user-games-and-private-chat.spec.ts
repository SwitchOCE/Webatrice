import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { GamePage } from '../pages';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

function userRow(page: Page, name: string) {
  return page.locator('.user-display').filter({ hasText: name });
}

test('shows another user\'s games and joins one from the list', async ({ newContext }) => {
  test.setTimeout(120_000);
  const hostCtx = await newContext();
  const viewerCtx = await newContext();

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

  const viewerGame = new GamePage(viewerPage);
  await viewerGame.deckSelect.waitForOpen();
  await expect(dialog).toBeHidden();

  await viewerGame.deckSelect.leaveGame();
  const hostGame = new GamePage(hostPage);
  await hostGame.deckSelect.waitForOpen();
  await hostGame.deckSelect.leaveGame();
});

test('a private chat keeps the draft when the partner goes offline', async ({ newContext }) => {
  test.setTimeout(120_000);
  const senderCtx = await newContext();
  const partnerCtx = await newContext();

  const senderPage = await senderCtx.newPage();
  const partnerPage = await partnerCtx.newPage();

  await registerAndJoinFirstRoom(senderPage);
  const partner = await registerAndJoinFirstRoom(partnerPage);
  const partnerName = partner.user.username;

  await userRow(senderPage, partnerName).getByRole('link').click();
  const presence = senderPage.getByTestId('private-chat-presence');
  await expect(presence).toHaveText(/online/i, { timeout: 15_000 });

  const composer = senderPage.getByPlaceholder(`Message ${partnerName}`);
  await composer.fill('hello there');
  await senderPage.getByRole('button', { name: 'Send' }).click();
  await expect(senderPage.getByText('hello there')).toBeVisible();

  await partnerCtx.close();

  await expect(senderPage.getByText(`${partnerName} has left the server.`)).toBeVisible({ timeout: 30_000 });
  await expect(presence).toHaveText(/offline/i);

  await composer.fill('are you still there?');
  await expect(senderPage.getByText(`${partnerName} is offline; messages cannot be delivered.`)).toBeVisible();
  await expect(senderPage.getByRole('button', { name: 'Send' })).toBeDisabled();
  await composer.press('Enter');
  await expect(composer).toHaveValue('are you still there?');
});
