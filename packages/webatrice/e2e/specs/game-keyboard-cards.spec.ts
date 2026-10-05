import { resolve } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { t } from '../fixtures/i18n';
import { tabTo } from '../fixtures/keyboard';
import { randomSuffix } from '../fixtures/users';
import { GamePage } from '../pages';

// The cards themselves with the keyboard alone (aud.md G2-G5, G10): draw from
// the library pile's menu, play a land from the hand with Enter, tap it with
// Enter, point an arrow from it at the other player, and put it into the
// graveyard through its menu's "Move to". The other client checks each step
// as it arrives through Servatrice. On the way it pins the board's Tab rule:
// on a card Tab is Next Phase, and F6 leaves the card's zone.

const DECK_PATH = resolve(__dirname, '..', 'fixtures', 'decks', 'forest-60.cod');

/** Moves focus down `menu` with the arrow keys until the entry named `name` has it. */
async function arrowToItem(page: Page, menu: Locator, name: string): Promise<void> {
  const item = menu.getByRole('menuitem', { name, exact: true });
  for (let i = 0; i < 40; i++) {
    if (await item.evaluate((el) => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`ArrowDown never reached "${name}"`);
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
  const phases = page.getByRole('navigation', { name: t('PhaseTrack.label') });

  // Into the game from the keyboard: Shift+Enter focuses the chat box.
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByRole('combobox', { name: 'Game chat message' })).toBeFocused();

  // Draw: the library pile is a button that opens the library menu.
  const handBefore = await hand.getByRole('option').count();
  const library = game.zoneStack('deck');
  await tabTo(page, library);
  await page.keyboard.press('Enter');
  const libraryMenu = page.getByRole('menu', { name: t('ZoneStack.library'), exact: true });
  await expect(libraryMenu.getByRole('menuitem', {
    name: t('ShortcutsTab.action.game.drawCard'), exact: true,
  })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hand.getByRole('option')).toHaveCount(handBefore + 1, { timeout: 15_000 });
  await expect(library).toBeFocused();

  // The Tab rule: on a card Tab is Next Phase (untap → upkeep) and focus
  // stays; F6 then leaves the hand for the next tab stop, off every zone.
  const firstCard = hand.locator('[role="option"][tabindex="0"]');
  await tabTo(page, firstCard);
  await expect(phases.getByRole('button', {
    name: t('GamePhase.untap.short'), exact: true,
  })).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('Tab');
  await expect(phases.getByRole('button', {
    name: t('GamePhase.upkeep.short'),
  })).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
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
  await arrowToItem(page, cardMenu, t('CardMenu.drawArrow'));
  await page.keyboard.press('Enter');
  await expect(page.getByText(t('PendingTargetAnnouncer.arrow', { name: 'Forest' }))).toBeAttached();
  const theirLife = page.getByRole('button', { name: `${them}'s life` });
  await tabTo(page, theirLife);
  await page.keyboard.press('Enter');
  await expect(watcher.logLine(`${me} points from their Forest to ${them}.`)).toBeVisible({ timeout: 15_000 });

  // Into the graveyard through the menu: Move to → Graveyard.
  await tabTo(page, forest);
  await page.keyboard.press('Shift+F10');
  await expect(cardMenu).toBeVisible();
  await arrowToItem(page, cardMenu, t('CardMenu.moveTo'));
  await page.keyboard.press('ArrowRight');
  const moveMenu = page.getByRole('menu', { name: t('CardMenu.moveTo'), exact: true });
  await arrowToItem(page, moveMenu, t('ZoneLabel.title.grave'));
  await page.keyboard.press('Enter');
  const graveyardName = t('ZoneStack.pileWithTop', {
    zone: t('ZoneStack.graveyard'), count: 1, top: 'Forest',
  });
  await expect(game.localBoard.getByRole('button', { name: graveyardName })).toBeVisible({ timeout: 15_000 });
  await expect(watcher.opponentBoard.getByRole('button', { name: graveyardName })).toBeVisible({ timeout: 15_000 });
});
