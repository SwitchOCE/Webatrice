import { resolve } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { tabTo } from '../fixtures/keyboard';
import { randomSuffix } from '../fixtures/users';
import { GamePage } from '../pages';

// The cards themselves with the keyboard alone (aud.md G2-G5, G10): draw from
// the library pile's menu, play a land from the hand with Enter, tap it with
// Enter, point an arrow from it at the other player, and put it into the
// graveyard through its menu's "Move to". The other client checks each step
// as it arrives through Servatrice. On the way it pins the board's Tab rule:
// on a card Tab is Next Phase, and F6 leaves the card's zone. Then the
// keyboard move (M) from the two floating card views, the graveyard view and
// a lent library: its dialog must open over the view, take the pointer and
// the keyboard, and move the card.

const DECK_PATH = resolve(__dirname, '..', 'fixtures', 'decks', 'forest-60.cod');

/** Moves focus down `menu` with the arrow keys until the entry named `name`
 *  has it. The menu moves focus a frame after the key (WebKit can lag more),
 *  so each step waits for focus to settle in the menu and to move, rather
 *  than pressing ahead of it and overshooting. */
async function arrowToItem(page: Page, menu: Locator, name: string): Promise<void> {
  const item = menu.getByRole('menuitem', { name, exact: true });
  const focused = menu.locator(':focus');
  await expect(focused).toHaveCount(1);
  for (let i = 0; i < 40; i++) {
    if (await item.evaluate((el) => el === document.activeElement)) {
      return;
    }
    const before = await focused.textContent();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => ((await focused.count()) === 1 ? focused.textContent() : before)).not.toBe(before);
  }
  throw new Error(`ArrowDown never reached "${name}"`);
}

/** Proves the Move dialog sits on top: its "To" box has focus and takes a
 *  pointer hit (no view over it), then the keyboard finishes the move. */
async function moveWithDialog(page: Page, name: string, to?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: `Move ${name}` });
  const toBox = dialog.getByLabel('To', { exact: true });
  await expect(toBox).toBeFocused();
  await toBox.click({ trial: true, timeout: 5_000 });
  if (to) {
    await toBox.selectOption(to);
  }
  await tabTo(page, dialog.getByRole('button', { name: 'Move', exact: true }));
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

test('draw, play, tap, point and bin a card with the keyboard only', async ({ newContext }) => {
  test.setTimeout(180_000);
  const hostPage = await (await newContext()).newPage();
  const joinerPage = await (await newContext()).newPage();

  const [host, joiner] = await Promise.all([
    registerAndJoinFirstRoom(hostPage),
    registerAndJoinFirstRoom(joinerPage),
  ]);

  const gameDescription = `kbd-cards-${randomSuffix()}`;
  await host.rooms.createGame(gameDescription, { maxPlayers: 2 });
  await joiner.rooms.joinGame(gameDescription);
  const hostGame = new GamePage(hostPage);
  const joinerGame = new GamePage(joinerPage);
  await Promise.all([hostGame.loadDeck(DECK_PATH), joinerGame.loadDeck(DECK_PATH)]);
  await Promise.all([hostGame.setReady(), joinerGame.setReady()]);
  await Promise.all([hostGame.waitForBoard(), joinerGame.waitForBoard()]);

  await expect.poll(async () => (await hostGame.canAdvancePhase()) !== (await joinerGame.canAdvancePhase()), {
    timeout: 15_000,
  }).toBe(true);
  const hostActive = await hostGame.canAdvancePhase();
  const [game, watcher] = hostActive ? [hostGame, joinerGame] : [joinerGame, hostGame];
  const page = hostActive ? hostPage : joinerPage;
  const [me, them] = hostActive ? [host.user.username, joiner.user.username] : [joiner.user.username, host.user.username];

  const hand = page.getByRole('listbox', { name: new RegExp(`^${me}'s hand`) });
  const battlefield = page.getByRole('listbox', { name: new RegExp(`^${me}'s battlefield`) });
  const phases = page.getByRole('navigation', { name: 'Turn phases' });

  // Into the game from the keyboard: Shift+Enter focuses the chat box.
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByRole('combobox', { name: 'Game chat message' })).toBeFocused();

  // Draw: the library pile is a button that opens the library menu.
  const handBefore = await hand.getByRole('option').count();
  const library = page.getByRole('button', { name: /^Library, \d+ cards/ }).first();
  await tabTo(page, library);
  await page.keyboard.press('Enter');
  const libraryMenu = page.getByRole('menu', { name: 'Library' });
  await expect(libraryMenu.getByRole('menuitem', { name: 'Draw card', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hand.getByRole('option')).toHaveCount(handBefore + 1, { timeout: 15_000 });
  await expect(library).toBeFocused();

  // The Tab rule: on a card Tab is Next Phase (untap → upkeep) and focus
  // stays; F6 then leaves the hand for the next tab stop, off every zone.
  const firstCard = hand.locator('[role="option"][tabindex="0"]');
  await tabTo(page, firstCard);
  await expect(phases.getByRole('button', { name: 'Untap', exact: true })).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('Tab');
  await expect(phases.getByRole('button', { name: 'Upkeep' })).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
  await expect(watcher.logLine('It is now the upkeep step.')).toBeVisible({ timeout: 15_000 });
  await expect(firstCard).toBeFocused();
  await page.keyboard.press('F6');
  await expect(hand.getByRole('option').filter({ has: page.locator(':focus') })).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.closest('[role="listbox"]') == null)).toBe(true);
  await tabTo(page, firstCard);

  // Play a land: the arrows move through the hand, Enter plays the card.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const forest = battlefield.getByRole('option', { name: /^Forest/ }).first();
  await expect(forest).toBeVisible({ timeout: 15_000 });
  await expect(watcher.opponentBoard.locator('[data-card][data-zone="battlefield"]')).toHaveCount(1, { timeout: 15_000 });

  // Tap it: Enter on a battlefield card taps it, as a click does.
  await tabTo(page, forest);
  await page.keyboard.press('Enter');
  await expect(forest).toHaveAccessibleName('Forest, tapped', { timeout: 15_000 });
  await expect(watcher.opponentBoard.getByRole('option', { name: 'Forest, tapped' })).toBeVisible({ timeout: 15_000 });

  // Point an arrow at the other player: Shift+F10 opens the card menu,
  // "Draw arrow..." starts the pick (announced), and Enter on their life,
  // which takes focus while the pick is pending, ends it.
  await page.keyboard.press('Shift+F10');
  const cardMenu = page.getByRole('menu', { name: 'Forest' });
  await expect(cardMenu).toBeVisible();
  await arrowToItem(page, cardMenu, 'Draw arrow...');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Choose a target for the arrow from Forest/)).toBeAttached();
  const theirLife = page.getByRole('button', { name: `${them}'s life` });
  await tabTo(page, theirLife);
  await page.keyboard.press('Enter');
  await expect(watcher.logLine(`${me} points from their Forest to ${them}.`)).toBeVisible({ timeout: 15_000 });

  // Into the graveyard through the menu: Move to → Graveyard.
  await tabTo(page, forest);
  await page.keyboard.press('Shift+F10');
  await expect(cardMenu).toBeVisible();
  await arrowToItem(page, cardMenu, 'Move to');
  await page.keyboard.press('ArrowRight');
  const moveMenu = page.getByRole('menu', { name: 'Move to' });
  await arrowToItem(page, moveMenu, 'Graveyard');
  await page.keyboard.press('Enter');
  await expect(game.localBoard.getByRole('button', { name: 'Graveyard, 1 card, top: Forest' })).toBeVisible({ timeout: 15_000 });
  await expect(watcher.opponentBoard.getByRole('button', { name: 'Graveyard, 1 card, top: Forest' })).toBeVisible({ timeout: 15_000 });

  // M in the graveyard view: the Move dialog opens over the view.
  // From the chat box, as at the start: Tab reaches the piles from there.
  const graveyard = game.localBoard.getByRole('button', { name: 'Graveyard, 1 card, top: Forest' });
  await page.keyboard.press('Shift+Enter');
  await tabTo(page, graveyard);
  await page.keyboard.press('Enter');
  const graveMenu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: 'View graveyard', exact: true }) });
  await arrowToItem(page, graveMenu, 'View graveyard');
  await page.keyboard.press('Enter');
  const graveView = page.locator('.pointer-events-auto.resize').filter({ has: page.getByRole('heading', { name: /graveyard/i }) });
  await tabTo(page, graveView.getByRole('option', { name: /^Forest/ }));
  await page.keyboard.press('m');
  await moveWithDialog(page, 'Forest', 'exile');
  await expect(watcher.opponentBoard.getByRole('button', { name: /^Exile, 1 card/ })).toBeVisible({ timeout: 15_000 });

  // M on a card of a library lent to this player: the dialog opens over the
  // lent view, and offers only this player's battlefield.
  const watcherPage = hostActive ? joinerPage : hostPage;
  await watcher.localBoard.getByRole('button', { name: /^Library, \d+ cards/ }).focus();
  await watcherPage.keyboard.press('Enter');
  await arrowToItem(watcherPage, watcherPage.getByRole('menu', { name: 'Library' }), 'Lend library to...');
  await watcherPage.keyboard.press('ArrowRight');
  await arrowToItem(watcherPage, watcherPage.getByRole('menu', { name: 'Lend library to...' }), me);
  await watcherPage.keyboard.press('Enter');
  const lentCard = page.getByRole('button', { name: 'Move Forest to a battlefield' }).first();
  await lentCard.waitFor();
  await page.keyboard.press('Shift+Enter');
  await tabTo(page, lentCard);
  await page.keyboard.press('m');
  await moveWithDialog(page, 'Forest');
  await expect(battlefield.getByRole('option', { name: /^Forest/ })).toHaveCount(1, { timeout: 15_000 });
  await expect(watcher.opponentBoard.locator('[data-card][data-zone="battlefield"]')).toHaveCount(1, { timeout: 15_000 });
});
