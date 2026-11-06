import type { Page } from '@playwright/test';

import { E2E_ADMIN, E2E_HOST_LABEL, E2E_JUDGE, reachHost, registerAndReachRooms } from '../fixtures/flows';
import { queryServerDb } from '../fixtures/serverDb';
import { serverHas } from '../fixtures/serverVersion';
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
  await expect(page.getByLabel(/^username$/i)).toHaveValue(user.username);
  expect(await storedCredentials(page)).toEqual([]);
});

test('a ban shows its end time and reason, and is indefinite without one', async ({ page }) => {
  const { login, user } = await registerAndReachRooms(page);
  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);
  const ban = (minutes: number, reason: string) => queryServerDb(
    'insert into cockatrice_bans (user_name, ip_address, id_admin, time_from, minutes, reason, visible_reason, clientid) '
    + `select '${user.username}', '', id, now(), ${minutes}, 'e2e', '${reason}', '' `
    + `from cockatrice_users where name = '${E2E_ADMIN.username}'`,
  );

  ban(60, 'Testing bans');
  await login.login(user.username, user.password);
  await expect(page.getByText(/^You are banned until .+\. Reason: Testing bans$/)).toBeVisible({ timeout: 15_000 });
  await expect(login.loginButton).toBeEnabled({ timeout: 15_000 });

  queryServerDb(`delete from cockatrice_bans where user_name = '${user.username}'`);
  ban(0, 'Testing long bans');
  await login.login(user.username, user.password);
  await expect(page.getByText('You are banned indefinitely. Reason: Testing long bans')).toBeVisible({ timeout: 15_000 });
});

test('a reset token requested from the login page sets a new password', async ({ page }) => {
  const { login, rooms, user } = await registerAndReachRooms(page);
  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);

  await page.getByRole('button', { name: /forgot password/i }).click();
  await page.getByRole('dialog').getByLabel(/^username$/i).fill(user.username);
  await page.getByRole('button', { name: 'Request Reset Token' }).click();

  const reset = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Reset Password' }) });
  await expect(reset).toBeVisible({ timeout: 15_000 });
  await expect(reset.getByLabel(/^username$/i)).toHaveValue(user.username);
  const token = queryServerDb(`select token from cockatrice_users where name = '${user.username}'`);
  expect(token).not.toBe('');

  const newPassword = `${user.password}new`;
  await reset.getByLabel(/^token$/i).fill(token);
  await reset.getByLabel(/^password$/i).fill(newPassword);
  await reset.getByLabel(/password again/i).fill(newPassword);
  await reset.getByRole('button', { name: 'Reset Password' }).click();
  await expect(page.getByText('Password Reset Successfully')).toBeVisible({ timeout: 15_000 });
  await expect(reset).toBeHidden();

  await login.login(user.username, newPassword);
  await rooms.waitForRoomList();
});

test('repeated wrong passwords name the time to try again', async ({ page }) => {
  test.skip(!serverHas('deckSharing'), 'login limits arrived with Cockatrice 3.1');
  const { login, user } = await registerAndReachRooms(page);
  await page.reload();
  await login.selectHost(E2E_HOST_LABEL);

  await expect(async () => {
    await login.login(user.username, `${user.password}wrong`);
    await expect(page.getByText(/too many login attempts\. please try again after/i).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
});
