import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, registerAndReachRooms } from '../fixtures/flows';
import { topBarTab } from '../pages';

// Account self-service against the real Servatrice (which supports password
// hashing): the user menu reaches the Account page, a profile edit that
// changes the email carries the password check Servatrice requires, and a
// password change sent as a client-side hash still lets the user log back in
// with the new password.

async function openAccount(page: Page, userName: string): Promise<void> {
  await page.getByRole('button', { name: userName }).click();
  await page.getByRole('button', { name: /^account$/i }).click();
  // MemoryRouter: the address bar never changes, so assert on the Account tab instead.
  await expect(topBarTab(page, /^account/i)).toHaveAttribute('aria-current', 'page');
}

test('edit profile and change password, then log in with the new password', async ({ page }) => {
  test.setTimeout(90_000);
  const { login, rooms, user } = await registerAndReachRooms(page);
  await openAccount(page, user.username);

  // Profile: new real name and email. The email change needs the current password.
  await page.getByRole('button', { name: /^edit$/i }).click();
  const edit = page.getByRole('dialog', { name: /edit user profile/i });
  await edit.getByLabel(/real name/i).fill('E2E Tester');
  await edit.getByLabel(/^email$/i).fill(`${user.username}@example.com`);
  await edit.getByLabel(/current password/i).fill(user.password);
  await edit.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByText('User information updated.')).toBeVisible();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Real Name: E2E Tester')).toBeVisible();

  // A wrong old password is refused with desktop's message and keeps the dialog open.
  const newPassword = 'password456';
  await page.getByRole('button', { name: /change password/i }).click();
  const change = page.getByRole('dialog', { name: /change password/i });
  await change.getByLabel(/old password/i).fill('not-my-password');
  await change.getByLabel(/^new password$/i).fill(newPassword);
  await change.getByLabel(/confirm new password/i).fill(newPassword);
  await change.getByRole('button', { name: /^ok$/i }).click();
  await expect(change.getByRole('alert')).toHaveText('The old password is incorrect.');

  await change.getByLabel(/old password/i).fill(user.password);
  await change.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
  await expect(change).toBeHidden();

  // The new password is the one that works now.
  await page.getByRole('button', { name: user.username }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(login.hostPicker).toBeVisible();
  await login.selectHost(E2E_HOST_LABEL);
  await login.login(user.username, newPassword);
  await rooms.waitForRoomList();
});
