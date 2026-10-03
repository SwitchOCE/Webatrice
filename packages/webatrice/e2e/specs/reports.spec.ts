import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { E2E_MODERATOR, reachRoomsAs, registerAndJoinFirstRoom } from '../fixtures/flows';

// User reports and the moderation queue (Cockatrice #7091). The flow needs a
// Servatrice that implements them (Cockatrice master, 3.1), e.g.
//   SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca npm run test:e2e
// Against the pinned 3.0.0 release the same entry points must stay hidden,
// which this spec asserts instead.

function servatriceImage(): string {
  if (process.env.SERVATRICE_IMAGE) {
    return process.env.SERVATRICE_IMAGE;
  }
  const pin = readFileSync(resolve(__dirname, '..', '..', '..', '..', '.env.e2e'), 'utf-8');
  return /^SERVATRICE_IMAGE=(.*)$/m.exec(pin)?.[1] ?? '';
}

const SERVER_HAS_REPORTS = !/Release-3\.0\./.test(servatriceImage());

async function openUserMenuItem(page: Page, userName: string, item: string): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: userName }).click();
  await page.getByRole('button', { name: item }).click();
}

async function openPlayerPage(page: Page, userName: string): Promise<void> {
  await page.getByRole('link', { name: userName, exact: true }).first().click();
  await expect(page.locator('.player-view__card')).toContainText(userName, { timeout: 15_000 });
}

test('3.0 servers show no report entry points', async ({ newContext }) => {
  test.skip(SERVER_HAS_REPORTS, 'covered by the full report flow on a 3.1 server');
  const pageA = await (await newContext()).newPage();
  const pageB = await (await newContext()).newPage();
  const a = await registerAndJoinFirstRoom(pageA);
  const b = await registerAndJoinFirstRoom(pageB);

  await openPlayerPage(pageA, b.user.username);
  await expect(pageA.getByRole('button', { name: 'Report user' })).toHaveCount(0);
  await pageA.getByRole('banner').getByRole('button', { name: a.user.username }).click();
  await expect(pageA.getByRole('button', { name: 'My Reports' })).toHaveCount(0);
});

test('a report goes from user A to a moderator and its resolution back to A', async ({ newContext }) => {
  test.skip(!SERVER_HAS_REPORTS, 'needs a Servatrice with user reports (Cockatrice 3.1)');
  test.setTimeout(180_000);
  const pageA = await (await newContext()).newPage();
  const pageB = await (await newContext()).newPage();
  const pageMod = await (await newContext()).newPage();
  const a = await registerAndJoinFirstRoom(pageA);
  const b = await registerAndJoinFirstRoom(pageB);
  const description = `e2e report ${a.user.username} -> ${b.user.username}`;

  // A reports B from B's player page.
  await openPlayerPage(pageA, b.user.username);
  await pageA.getByRole('button', { name: 'Report user' }).click();
  const reportDialog = pageA.getByRole('dialog', { name: 'Report User' });
  await expect(reportDialog.getByTestId('report-reported-user')).toHaveText(b.user.username);
  await reportDialog.getByLabel('Category:').selectOption('verbal_abuse');
  await reportDialog.getByLabel('Description').fill(description);
  await reportDialog.getByRole('button', { name: 'Submit Report' }).click();
  await pageA.getByRole('button', { name: 'Yes' }).click();
  await expect(pageA.getByText('Your report has been submitted and will be reviewed by a moderator. Thank you.'))
    .toBeVisible({ timeout: 15_000 });
  await pageA.getByRole('button', { name: 'OK' }).click();

  // The moderator finds it in the queue, comments and resolves it.
  await reachRoomsAs(pageMod, E2E_MODERATOR);
  await openUserMenuItem(pageMod, E2E_MODERATOR.username, 'Report Queue');
  const queue = pageMod.getByTestId('report-queue');
  await queue.getByLabel('Search by username, category...').fill(a.user.username);
  const row = queue.locator('tr', { hasText: b.user.username });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.click();
  await expect(queue.getByTestId('report-description')).toHaveText(description);

  await queue.getByLabel('Add a comment:').fill('Looking into it');
  await queue.getByRole('button', { name: 'Send' }).click();
  await expect(queue.getByTestId('report-thread')).toContainText('Looking into it', { timeout: 15_000 });

  await queue.getByRole('button', { name: 'Resolve with note...' }).click();
  await pageMod.getByLabel('Resolution note (optional):').fill('Warned the user');
  await pageMod.getByRole('button', { name: 'OK' }).click();
  await expect(queue.getByTestId('report-queue-status')).toHaveText('Done.', { timeout: 15_000 });

  // A is told and sees the resolution in My Reports.
  await expect(pageA.getByText('Report Resolved')).toBeVisible({ timeout: 15_000 });
  await openUserMenuItem(pageA, a.user.username, 'My Reports');
  const mine = pageA.getByTestId('my-reports');
  const myRow = mine.locator('tr', { hasText: b.user.username });
  await expect(myRow).toContainText('resolved', { timeout: 15_000 });
  await myRow.click();
  await expect(mine.getByTestId('report-resolution')).toContainText('Warned the user');
  await expect(mine.getByTestId('report-thread')).toContainText('Looking into it');
  await expect(mine.getByLabel('Add a comment:')).toBeDisabled();
});
