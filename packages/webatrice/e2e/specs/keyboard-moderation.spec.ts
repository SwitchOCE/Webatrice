import { expect, test } from '../fixtures/test';

import { E2E_MODERATOR, joinFirstRoomAs, registerAndJoinFirstRoom } from '../fixtures/flows';

// Keyboard-only path through a moderator action, in every browser of the
// matrix: the user context menu opens from the focused name (Shift+F10, as on
// desktop), its entries are reached with the arrows, the dialogs they open take
// focus, keep Tab inside and hand focus back to the name when they close. Only
// the first focus, on the name, is placed directly; everything after it is key
// presses, and each later step starts from wherever the last one left focus.

test('a moderator warns a user and reads the warning back without a pointer', async ({ newContext }) => {
  test.setTimeout(120_000);
  const targetPage = await (await newContext()).newPage();
  const moderatorPage = await (await newContext()).newPage();
  const { user: target } = await registerAndJoinFirstRoom(targetPage);
  await joinFirstRoomAs(moderatorPage, E2E_MODERATOR);
  const { keyboard } = moderatorPage;

  const name = moderatorPage.locator('aside').getByRole('link', { name: target.username });
  await expect(name).toBeVisible({ timeout: 15_000 });
  await name.focus();

  // Shift+F10 on the name opens its menu with the first entry focused; ↓ walks to an entry.
  async function chooseFromUserMenu(entry: string): Promise<void> {
    await expect(name).toBeFocused();
    await keyboard.press('Shift+F10');
    const menu = moderatorPage.getByRole('menu');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    const item = menu.getByRole('menuitem', { name: entry });
    for (let step = 0; step < 20 && !(await item.evaluate((el) => el === document.activeElement)); step++) {
      await keyboard.press('ArrowDown');
    }
    await expect(item).toBeFocused();
    await keyboard.press('Enter');
    await expect(menu).toBeHidden();
  }

  // Warn: the dialog opens on the reason list once the server has answered.
  await chooseFromUserMenu('Warn user');
  const warnDialog = moderatorPage.getByRole('dialog', { name: 'Warn user for misconduct' });
  await expect(warnDialog).toBeVisible({ timeout: 15_000 });
  const reasons = warnDialog.getByRole('combobox');
  await expect(reasons).toBeFocused();
  await keyboard.type('Spamming');
  await expect(reasons).toHaveValue('Spamming');

  // Tab cycles inside the dialog instead of escaping to the page behind it.
  for (let step = 0; step < 8; step++) {
    await keyboard.press('Shift+Tab');
    await expect(warnDialog.locator(':focus')).toHaveCount(1);
  }
  // Tab on from wherever the Shift+Tab loop ended until OK has focus.
  const ok = warnDialog.getByRole('button', { name: 'OK' });
  for (let step = 0; step < 12 && !(await ok.evaluate((el) => el === document.activeElement)); step++) {
    await keyboard.press('Tab');
  }
  await expect(ok).toBeFocused();
  await keyboard.press('Enter');
  await expect(warnDialog).toBeHidden();
  await expect(name).toBeFocused();

  // The warning history lists it; Escape closes the dialog and focus goes back to the name.
  await chooseFromUserMenu('View user\'s warn history');
  const warnHistory = moderatorPage.getByRole('dialog', { name: 'Warning History' });
  await expect(warnHistory).toBeVisible({ timeout: 15_000 });
  await expect(warnHistory.getByRole('row').filter({ hasText: 'Spamming' })).toContainText(E2E_MODERATOR.username);
  await keyboard.press('Escape');
  await expect(warnHistory).toBeHidden();
  await expect(name).toBeFocused();
});
