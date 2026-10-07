import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, registerAndReachRooms } from '../fixtures/flows';
import { LoginPage } from '../pages';

// Settings › General "Startup tab". Desktop applies it once per launch: here, the first login
// of a page load that is not a reload. Signing in again and reloading keep the page the user
// was on. The app routes through a MemoryRouter (AppShell), so the page is read from the UI,
// not from the URL.

test('the startup tab opens once per launch; signing in again and reloading keep the page', async ({ page, context, browserName }) => {
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

  // Sign out from the lobby and back in: the second login of the page load stays in the lobby.
  await rooms.waitForRoomList();
  await userMenu.click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(login.hostPicker).toBeVisible();
  await login.login(user.username, user.password);
  await expect(lobbyRooms).toBeVisible({ timeout: 30_000 });
  await expect(replaysPage).toBeHidden();

  // Reload: the login the reload starts with returns to the lobby. Playwright's Firefox build
  // reports every reload, scripted or not, as Navigation Timing 'navigate', so it cannot show a
  // reload to the app; the unit specs of detectPageReload cover the decision itself.
  if (browserName === 'firefox') {
    test.info().annotations.push({ type: 'skipped step', description: 'reload: Playwright Firefox reports it as navigate' });
  } else {
    await page.reload();
    await expect(login.hostPicker).toBeVisible();
    await login.selectHost(E2E_HOST_LABEL);
    await login.login(user.username, user.password);
    await expect(lobbyRooms).toBeVisible({ timeout: 30_000 });
    await expect(replaysPage).toBeHidden();
  }

  // A new launch: a fresh page shares the storage that still names the lobby as the last
  // route, yet its first login opens the startup tab.
  const launch = await context.newPage();
  const launchLogin = new LoginPage(launch);
  await launchLogin.goto();
  await launchLogin.selectHost(E2E_HOST_LABEL);
  await launchLogin.login(user.username, user.password);
  await expect(launch.getByRole('region', { name: /local replays/i })).toBeVisible({ timeout: 30_000 });
});
