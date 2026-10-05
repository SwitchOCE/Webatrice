import { resolve } from 'node:path';

import { expect, test } from '../fixtures/test';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { tabTo } from '../fixtures/keyboard';
import { randomSuffix } from '../fixtures/users';
import { GamePage } from '../pages';

// A turn's worth of the board's own controls, driven with the keyboard alone
// by the active player, with the other client watching the results arrive
// through Servatrice: life up and down on its spin button, a mana counter in
// the pool's single tab stop, a phase change from the phase bar, the player
// list's "More actions" menu, and a library view opened with F3 and closed
// with Escape, focus going back where it came from each time. Two accounts,
// the game and the decks are mouse-driven setup; nothing after the board
// appears is clicked.

const DECK_PATH = resolve(__dirname, '..', 'fixtures', 'decks', 'forest-60.cod');

test('play a turn of the board controls with the keyboard only', async ({ newContext }) => {
  test.setTimeout(180_000);
  const hostPage = await (await newContext()).newPage();
  const joinerPage = await (await newContext()).newPage();

  const [host, joiner] = await Promise.all([
    registerAndJoinFirstRoom(hostPage),
    registerAndJoinFirstRoom(joinerPage),
  ]);

  const gameDescription = `kbd-board-${randomSuffix()}`;
  await host.rooms.createGame(gameDescription, { maxPlayers: 2 });
  await joiner.rooms.joinGame(gameDescription);
  const hostGame = new GamePage(hostPage);
  const joinerGame = new GamePage(joinerPage);
  await Promise.all([hostGame.loadDeck(DECK_PATH), joinerGame.loadDeck(DECK_PATH)]);
  await Promise.all([hostGame.setReady(), joinerGame.setReady()]);
  await Promise.all([hostGame.waitForBoard(), joinerGame.waitForBoard()]);

  // Servatrice starts the game in the untap step with one active player.
  await expect.poll(async () => (await hostGame.canAdvancePhase()) !== (await joinerGame.canAdvancePhase()), {
    timeout: 15_000,
  }).toBe(true);
  const hostActive = await hostGame.canAdvancePhase();
  const watcher = hostActive ? joinerGame : hostGame;
  const page = hostActive ? hostPage : joinerPage;
  const [me, them] = hostActive ? [host.user.username, joiner.user.username] : [joiner.user.username, host.user.username];

  // Into the game from the keyboard: Shift+Enter focuses the chat box (desktop's
  // "focus chat"), and Tab and Shift+Tab move between controls from there.
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByRole('combobox', { name: 'Game chat message' })).toBeFocused();

  // Life: a spin button. Up gains one, Down loses one; the other client's log
  // reads each change out.
  const life = page.getByRole('spinbutton', { name: `${me}'s life` });
  await tabTo(page, life);
  await expect(life).toHaveAttribute('aria-valuenow', '20');
  await page.keyboard.press('ArrowUp');
  await expect(life).toHaveAttribute('aria-valuenow', '21', { timeout: 15_000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(life).toHaveAttribute('aria-valuenow', '19', { timeout: 15_000 });
  await expect(watcher.logLine(`${me} sets counter Life to 19 (-1).`)).toBeVisible({ timeout: 15_000 });

  // Mana: the pool is one tab stop; Right moves to green, Up and Down change it.
  const pool = page.getByRole('group', { name: 'Mana pool' }).first();
  await tabTo(page, pool.locator('[role="spinbutton"][tabindex="0"]'));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
  }
  const green = pool.getByRole('spinbutton', { name: 'Green' });
  await expect(green).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(green).toHaveAttribute('aria-valuenow', '1', { timeout: 15_000 });
  await page.keyboard.press('ArrowDown');
  await expect(green).toHaveAttribute('aria-valuenow', '0', { timeout: 15_000 });

  // Phase: the phase bar's buttons are named while collapsed; Enter on Upkeep
  // changes phase and marks it current.
  const upkeep = page.getByRole('navigation', { name: 'Turn phases' }).getByRole('button', { name: 'Upkeep' });
  await tabTo(page, upkeep);
  await page.keyboard.press('Enter');
  await expect(upkeep).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
  await expect(watcher.logLine('It is now the upkeep step.')).toBeVisible({ timeout: 15_000 });

  // Player list: the row's "More actions" button opens its menu with focus in
  // it; Escape closes it and focus goes back to the button.
  const more = page.getByRole('button', { name: `More actions for ${them}` });
  await tabTo(page, more);
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: `Actions for ${them}` });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  // Type-ahead jumps to an entry by its first letters.
  await page.keyboard.type('pri');
  await expect(menu.getByRole('menuitem', { name: 'Private chat' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();

  // Zone view: F3 opens the library view with focus in its search box; Escape
  // closes it and focus goes back to the control that had it.
  await page.keyboard.press('F3');
  const view = page.getByRole('dialog', { name: /library/i });
  await expect(view).toBeVisible({ timeout: 15_000 });
  await expect(view.getByRole('textbox', { name: 'Search the cards' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  await expect(more).toBeFocused();
});
