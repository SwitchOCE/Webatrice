import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, registerAndJoinFirstRoom, registerAndReachRooms } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';
import { GamePage, LoginPage } from '../pages';

// The audit's P1 blocker: a game could not be joined without a mouse. This
// spec walks login → room → game with the keyboard alone (Tab, arrows,
// Enter), so a regression in any step's focusability or key handling fails
// here. Account creation and the host's game are mouse-driven setup.

// Press Tab (Shift+Tab when the target comes earlier in the document) until
// `target` has focus, proving it is in the tab order. Never relies on
// wrapping past the end of the page: Firefox wraps into the browser chrome.
async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  await target.waitFor();
  for (let i = 0; i < maxPresses; i++) {
    const position = await target.evaluate((element) => {
      const active = document.activeElement;
      if (element === active) {
        return 'focused';
      }
      if (!active || active === document.body) {
        return 'after';
      }
      return active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING ? 'before' : 'after';
    });
    if (position === 'focused') {
      return;
    }
    await page.keyboard.press(position === 'before' ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Tab never reached ${target}`);
}

test('log in, join a room and join a game with the keyboard only', async ({ newContext }) => {
  test.setTimeout(120_000);
  const hostPage = await (await newContext()).newPage();
  const page = await (await newContext()).newPage();

  const host = await registerAndJoinFirstRoom(hostPage);
  const gameDescription = `kbd-${randomSuffix()}`;
  await host.rooms.createGame(gameDescription, { maxPlayers: 2 });

  // Setup: an account and a saved host, then back to a fresh login screen.
  const { user } = await registerAndReachRooms(page);
  await page.reload();
  const login = new LoginPage(page);
  await expect(login.hostPicker).toBeVisible();

  // Pick the saved host from the known-hosts listbox.
  await tabTo(page, login.hostPicker);
  await page.keyboard.press('Enter');
  const option = page.getByRole('option').filter({ hasText: new RegExp(`^${E2E_HOST_LABEL}`, 'i') }).first();
  await tabTo(page, option);
  await page.keyboard.press('Enter');
  await expect(login.hostPicker).toBeFocused();
  await expect(login.loginButton).toBeEnabled({ timeout: 15_000 });

  // Log in.
  await tabTo(page, page.getByLabel(/^username$/i));
  await page.keyboard.type(user.username);
  await tabTo(page, page.getByLabel(/^password$/i));
  await page.keyboard.type(user.password);
  await tabTo(page, login.loginButton);
  await page.keyboard.press('Enter');

  // Join the first room from the rooms table.
  const roomsTable = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: /^name$/i }) });
  const joinRoom = roomsTable.getByRole('button', { name: /^(join|open)$/i }).first();
  await expect(joinRoom).toBeVisible({ timeout: 30_000 });
  await tabTo(page, joinRoom);
  await page.keyboard.press('Enter');

  // Tab into the games grid, arrow to the host's game and join it with Enter.
  const grid = page.getByRole('grid', { name: /^games in/i });
  const gameRow = grid.getByRole('row').filter({ hasText: gameDescription });
  await expect(gameRow).toBeVisible({ timeout: 15_000 });
  await tabTo(page, grid.locator('[role="row"][tabindex="0"]'));
  for (let i = 0; i < 50 && !(await gameRow.evaluate((row) => row === document.activeElement)); i++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(gameRow).toBeFocused();
  // Tabbing in only focuses the row; Space selects it, which enables Join.
  await page.keyboard.press('Space');
  await expect(gameRow).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^join$/i })).toBeEnabled();
  await page.keyboard.press('Enter');

  await new GamePage(page).deckSelect.waitForOpen();
});
