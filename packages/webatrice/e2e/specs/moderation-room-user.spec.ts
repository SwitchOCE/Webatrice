import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';

import { E2E_MODERATOR, joinFirstRoomAs, registerAndJoinFirstRoom } from '../fixtures/flows';

// A seeded moderator (docker/servatrice/judge-seed.sql) right-clicks a fresh
// user in the room's user list and runs desktop's moderator round trips
// against the real Servatrice: warn (GetUserInfo → GetWarnList → WarnUser,
// with the reasons from servatrice-e2e.ini's `officialwarnings`), then the
// warn history (now holding that warning) and the ban history (empty).

async function openUserMenuEntry(page: Page, userName: string, entry: string): Promise<void> {
  const row = page.locator('aside').getByText(userName, { exact: true });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: entry }).click();
}

test('moderator warns a room user and reads their warn and ban history', async ({ newContext }) => {
  test.setTimeout(120_000);
  const targetCtx = await newContext();
  const moderatorCtx = await newContext();

  const targetPage = await targetCtx.newPage();
  const moderatorPage = await moderatorCtx.newPage();

  const { user: target } = await registerAndJoinFirstRoom(targetPage);
  await joinFirstRoomAs(moderatorPage, E2E_MODERATOR);

  // Warn: the dialog only opens once user info and the warn list are back.
  await openUserMenuEntry(moderatorPage, target.username, 'Warn user');
  const warnDialog = moderatorPage.getByRole('dialog', { name: 'Warn user for misconduct' });
  await expect(warnDialog).toBeVisible({ timeout: 15_000 });
  const reasons = warnDialog.getByRole('combobox');
  await expect(reasons.getByRole('option', { name: 'Flaming' })).toBeAttached();
  await reasons.selectOption('Spamming');
  await warnDialog.getByRole('button', { name: 'OK' }).click();
  await expect(warnDialog).toBeHidden();

  // Warn history now lists the warning just sent.
  await openUserMenuEntry(moderatorPage, target.username, 'View user\'s warn history');
  const warnHistory = moderatorPage.getByRole('dialog', { name: 'Warning History' });
  await expect(warnHistory).toBeVisible({ timeout: 15_000 });
  const warning = warnHistory.getByRole('row').filter({ hasText: 'Spamming' });
  await expect(warning).toContainText(E2E_MODERATOR.username);
  await warnHistory.getByRole('button', { name: 'Close' }).last().click();
  await expect(warnHistory).toBeHidden();

  // A never-banned user gets desktop's message box instead of a table.
  await openUserMenuEntry(moderatorPage, target.username, 'View user\'s ban history');
  const banHistory = moderatorPage.getByRole('dialog').filter({ hasText: 'User has never been banned.' });
  await expect(banHistory).toBeVisible({ timeout: 15_000 });
  await banHistory.getByRole('button', { name: 'OK' }).click();
});
