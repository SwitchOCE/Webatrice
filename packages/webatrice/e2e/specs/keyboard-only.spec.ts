import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { E2E_HOST_LABEL, joinFirstRoom, registerAndJoinFirstRoom, registerAndReachRooms } from '../fixtures/flows';
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
  test.setTimeout(240_000);
  const hostPage = await (await newContext()).newPage();
  const page = await (await newContext()).newPage();

  const host = await registerAndJoinFirstRoom(hostPage);
  const prefix = `kbd-${randomSuffix()}`;
  const gameDescription = `${prefix}-00`;
  await host.rooms.createGame(gameDescription, { maxPlayers: 2 });

  // Fifteen live games exceed the viewport plus react-window's overscan.
  // Use three hosts to stay within Servatrice's five-games-per-user limit.
  for (let owner = 0; owner < 3; owner++) {
    const ownerPage = owner === 0 ? hostPage : await (await newContext()).newPage();
    const session = owner === 0 ? host : await registerAndJoinFirstRoom(ownerPage);
    for (let slot = owner === 0 ? 1 : 0; slot < 5; slot++) {
      if (owner === 0 || slot > 0) {
        await session.rooms.waitForRoomList();
        await joinFirstRoom(ownerPage, session.rooms);
      }
      await session.rooms.createGame(`${prefix}-${String(owner * 5 + slot).padStart(2, '0')}`, { maxPlayers: 2 });
    }
  }

  // Setup: an account and a saved host, then back to a fresh login screen.
  const { user } = await registerAndReachRooms(page);
  await page.reload();
  const login = new LoginPage(page);
  await expect(login.hostPicker).toBeVisible();

  // Pick the saved host from the known-hosts listbox.
  await tabTo(page, login.hostPicker);
  await page.keyboard.press('Enter');
  // The listbox is one tab stop; typing the host's name moves its active
  // option there (aria-activedescendant) and Enter picks it.
  const listbox = page.getByRole('listbox', { name: /saved hosts/i });
  await tabTo(page, listbox);
  await page.keyboard.type(E2E_HOST_LABEL);
  const option = listbox.getByRole('option').filter({ hasText: new RegExp(`^${E2E_HOST_LABEL}`, 'i') }).first();
  await expect(listbox).toHaveAttribute('aria-activedescendant', (await option.getAttribute('id'))!);
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
  await page.setViewportSize({ width: 1280, height: 720 });
  // Sort descending by description so our target follows all fourteen fillers,
  // even when several games were created in the same second.
  const descriptionSort = grid.getByRole('button', { name: /^description$/i });
  await tabTo(page, descriptionSort);
  await page.keyboard.press('Enter');
  const descriptionHeader = grid.getByRole('columnheader', { name: /description/i });
  if (await descriptionHeader.getAttribute('aria-sort') !== 'descending') {
    await page.keyboard.press('Enter');
  }
  await expect(descriptionHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(gameRow).toHaveCount(0);
  const scroller = grid.locator('.virtual-list__list');
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await tabTo(page, grid.locator('[role="row"][tabindex="0"]'));
  let moves = 0;
  while (moves < 100) {
    if (await gameRow.count() && await gameRow.evaluate((row) => row === document.activeElement)) {
      break;
    }
    await page.keyboard.press('ArrowDown');
    moves++;
  }
  expect(moves).toBeGreaterThanOrEqual(14);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(gameRow).toBeInViewport();
  await expect(gameRow).toBeFocused();
  // Tabbing in only focuses the row; Space selects it, which enables Join.
  await page.keyboard.press('Space');
  await expect(gameRow).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^join$/i })).toBeEnabled();
  await page.keyboard.press('Enter');

  await new GamePage(page).deckSelect.waitForOpen();
});
