import type { Page } from '@playwright/test';

import { E2E_HOST_LABEL, E2E_JUDGE, reachHost, registerAndReachRooms } from '../fixtures/flows';
import { expect, test } from '../fixtures/test';
import { LoginPage, RoomsPage } from '../pages';

function storedCredentials(page: Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('Webatrice');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const read = database.transaction('hosts').objectStore('hosts').getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        database.close();
        resolve((read.result as { hashedPassword?: string }[]).flatMap((host) => host.hashedPassword ?? []));
      };
    };
  }));
}

async function signInSavingPassword(login: LoginPage, page: Page, username: string, password: string): Promise<void> {
  await page.getByText('Save password', { exact: true }).click();
  await expect(page.getByLabel('Save password')).toBeChecked();
  await login.login(username, password);
}

async function expectUsableCredential(page: Page, password: string): Promise<void> {
  await expect.poll(() => storedCredentials(page)).toHaveLength(1);
  const [credential] = await storedCredentials(page);
  expect(credential).not.toContain(password);
  expect(credential.startsWith('$challenge$')).toBe(false);
}

test.setTimeout(90_000);

test('a saved password signs a registered account in again', async ({ page }) => {
  const { login, rooms, user } = await registerAndReachRooms(page);
  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);
  await signInSavingPassword(login, page, user.username, user.password);
  await rooms.waitForRoomList();
  await expectUsableCredential(page, user.password);

  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);
  await expect(page.getByLabel(/^username$/i)).toHaveValue(user.username);
  await login.loginButton.click();
  await rooms.waitForRoomList();
});

test('a saved password signs a seeded older-format account in again', async ({ page }) => {
  const login = new LoginPage(page);
  const rooms = new RoomsPage(page);
  await reachHost(login);
  await signInSavingPassword(login, page, E2E_JUDGE.username, E2E_JUDGE.password);
  await rooms.waitForRoomList();
  await expectUsableCredential(page, E2E_JUDGE.password);

  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);
  await expect(page.getByLabel(/^username$/i)).toHaveValue(E2E_JUDGE.username);
  await login.loginButton.click();
  await rooms.waitForRoomList();
});

test('a wrong password is refused and nothing is saved', async ({ page }) => {
  const { login, user } = await registerAndReachRooms(page);
  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);
  await signInSavingPassword(login, page, user.username, `${user.password}wrong`);

  await expect(page.getByText(/incorrect username or password/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(login.loginButton).toBeEnabled({ timeout: 15_000 });
  expect(await storedCredentials(page)).toEqual([]);
});
