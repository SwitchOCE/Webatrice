import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

import { E2E_ADMIN, E2E_MODERATOR, reachRoomsAs, registerAndReachRooms } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

// Staff pages against the real Servatrice: the Administration tab's "Update
// server message" (desktop TabAdmin) and the Moderation tab's alts lookup
// (desktop TabModeration, Cockatrice 3.1 only). The seeded staff accounts come
// from docker/servatrice/judge-seed.sql.
//
// Moderation needs a 3.1 server. Run against Cockatrice master with
//   SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca npm run test:e2e
// Against the pinned 3.0 release the spec checks that Moderation stays hidden.
// global-setup decodes Event_ServerIdentification, independently of the UI and image tag.
const ADVERTISED_VERSION = process.env.SERVATRICE_ADVERTISED_VERSION;

// Same compose invocation as the package's test:e2e:up script (cwd = packages/webatrice).
function runSql(sql: string): void {
  execFileSync('docker', [
    'compose', '--env-file', '../../.env.e2e', '--env-file', '.env.e2e',
    '-f', '../../docker/servatrice/docker-compose.e2e.yml',
    'exec', '-T', 'mysql', 'mysql', '-uservatrice', '-ppassword', 'servatrice', '-e', sql,
  ], { stdio: 'pipe' });
}

// The TopBar user menu (username button in the page header) lists the staff pages.
async function openUserMenu(page: Page, userName: string): Promise<void> {
  await page.locator('header').getByRole('button', { name: userName, exact: true }).click();
}

async function openStaffPage(page: Page, userName: string, label: string): Promise<void> {
  await openUserMenu(page, userName);
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('an admin publishes a new server message from Administration', async ({ page }) => {
  test.setTimeout(90_000);
  await reachRoomsAs(page, E2E_ADMIN);

  // Servatrice serves the newest cockatrice_servermessages row for its server id
  // (0 in the e2e ini); Command_UpdateServerMessage re-reads and broadcasts it.
  const message = `E2E server message ${randomSuffix()}`;
  runSql(`INSERT INTO cockatrice_servermessages (id_server, timest, message) VALUES (0, NOW() + INTERVAL 1 SECOND, '${message}')`);

  await openStaffPage(page, E2E_ADMIN.username, 'Administration');
  await page.getByRole('button', { name: 'Update server message' }).click();
  await expect(page.getByText('Server message updated')).toBeVisible({ timeout: 15_000 });

  // The broadcast Event_ServerMessage replaced the MOTD shown on the server tab.
  await page.getByRole('tab').first().click();
  await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
});

test('a moderator looks up the alts of an account from Moderation', async ({ browser, page }) => {
  test.setTimeout(120_000);

  // A fresh account to investigate, registered from its own browser session.
  const suspectContext = await browser.newContext();
  const suspectPage = await suspectContext.newPage();
  const { user: suspect } = await registerAndReachRooms(suspectPage);

  await reachRoomsAs(page, E2E_MODERATOR);
  await openUserMenu(page, E2E_MODERATOR.username);

  expect(ADVERTISED_VERSION, 'global setup must capture the advertised server version').toBeTruthy();
  // import(): Playwright compiles specs to CommonJS, and datatrice only exports `import`.
  const { server, ServerCapability } = await import('@cockatrice/datatrice');
  if (!server.serverSupports(ADVERTISED_VERSION ?? null, ServerCapability.MODERATION_TOOLS)) {
    test.info().annotations.push({
      type: 'unsupported',
      description: `Moderation investigation coverage unavailable on advertised server ${ADVERTISED_VERSION}`,
    });
    await expect(page.getByRole('button', { name: 'Administration', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Moderation', exact: true })).toHaveCount(0);
    await suspectContext.close();
    return;
  }

  await page.getByRole('button', { name: 'Moderation', exact: true }).click();
  await page.getByRole('searchbox', { name: 'User name' }).fill(suspect.username);
  await page.getByRole('button', { name: 'Investigate' }).click();

  // GetUserAlts lists the account itself plus any sharing its IP / client id / email.
  const alts = page.getByRole('region', { name: 'Alts' });
  await expect(alts.getByRole('cell', { name: suspect.username, exact: true })).toBeVisible({ timeout: 15_000 });
  const info = page.getByRole('region', { name: 'User Info' });
  await expect(info.getByText('active', { exact: true })).toBeVisible();

  await suspectContext.close();
});
