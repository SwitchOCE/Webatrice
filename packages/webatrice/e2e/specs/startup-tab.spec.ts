import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, registerAndReachRooms } from '../fixtures/flows';

// Settings › General "Startup tab": a fresh login lands on the chosen page,
// while a reload returns the user to the page they were on.

test('a fresh login opens the startup tab; a reload keeps the current page', async ({ page }) => {
  test.setTimeout(90_000);
  const { login, rooms, user } = await registerAndReachRooms(page);
  const userMenu = page.getByRole('button', { name: user.username });

  await userMenu.click();
  await page.getByRole('button', { name: /^settings$/i }).click();
  await page.getByLabel(/^startup tab$/i).selectOption({ label: 'Game Replays' });
  // The room and server rows appear only for "Server Room".
  await expect(page.getByRole('textbox', { name: /^room$/i })).toBeHidden();

  // Sign out from the lobby and back in: the login lands on Game Replays.
  await rooms.waitForRoomList();
  await userMenu.click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(login.hostPicker).toBeVisible();
  // Signing out drops the connection, so the form waits on a fresh test-connection probe.
  await login.selectHost(E2E_HOST_LABEL);
  await login.login(user.username, user.password);
  await expect(page).toHaveURL(/\/replays$/);

  // Back to the lobby and reload: the login the reload starts with returns to the lobby.
  await rooms.waitForRoomList();
  await expect(page).toHaveURL(/\/server$/);
  await page.reload();
  await expect(login.hostPicker).toBeVisible();
  await login.selectHost(E2E_HOST_LABEL);
  await login.login(user.username, user.password);
  await expect(page.getByRole('columnheader', { name: /^name$/i })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/server$/);
});
