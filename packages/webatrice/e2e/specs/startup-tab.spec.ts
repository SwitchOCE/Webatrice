import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, registerAndReachRooms } from '../fixtures/flows';

// Settings › General "Startup tab": a fresh login lands on the chosen page, while a
// reload returns the user to the page they were on. The app routes through a
// MemoryRouter (AppShell), so the page is read from the UI, not from the URL.

test('a fresh login opens the startup tab; a reload keeps the current page', async ({ page }) => {
  test.setTimeout(120_000);
  const { login, rooms, user } = await registerAndReachRooms(page);
  const userMenu = page.getByRole('button', { name: user.username });
  const replaysPage = page.getByRole('region', { name: /local replays/i });
  // The lobby's rooms panel; its table's "Name" header is not unique (the replays tables have one).
  const lobbyRooms = page.getByRole('heading', { name: /^rooms$/i });

  await userMenu.click();
  await page.getByRole('menuitem', { name: /^settings$/i }).click();
  await page.getByLabel(/^startup tab$/i).selectOption({ label: 'Game Replays' });
  // The room row shows only for "Server Room".
  await expect(page.getByRole('textbox', { name: /^room$/i })).toBeHidden();

  // Sign out from the lobby and back in: the login lands on Game Replays.
  await rooms.waitForRoomList();
  await userMenu.click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(login.hostPicker).toBeVisible();
  await login.login(user.username, user.password);
  await expect(replaysPage).toBeVisible({ timeout: 30_000 });

  // Back to the lobby and reload: the login the reload starts with returns to the lobby,
  // not to the startup tab.
  await rooms.waitForRoomList();
  await page.reload();
  await expect(login.hostPicker).toBeVisible();
  await login.selectHost(E2E_HOST_LABEL);
  await login.login(user.username, user.password);
  await expect(lobbyRooms).toBeVisible({ timeout: 30_000 });
  await expect(replaysPage).toBeHidden();
});
