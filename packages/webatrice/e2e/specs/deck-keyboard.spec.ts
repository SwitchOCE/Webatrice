import { expect, test } from '../fixtures/test';
import { tabTo } from '../fixtures/keyboard';
import { registerAndReachRooms } from '../fixtures/flows';

// Audit rows D1–D6: the deck editor worked only with a mouse (an unnamed
// quick-add field, rows whose actions needed hover, no focus in dialogs or
// menus). This spec builds and shares a deck with the keyboard alone: create
// it, quick-add a card through the combobox, change its count from the deck
// list's grid, save, and share it. Account creation and opening My Decks are
// mouse-driven setup.
//
// Sharing needs a 3.1 server
// (SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca); against the
// pinned 3.0 release the spec stops after the save.
const SERVER_IS_3_1 = /master|3\.1/.test(process.env.SERVATRICE_IMAGE ?? '');

test('create, fill, save and share a deck with the keyboard only', async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndReachRooms(page);
  await page.getByTitle('View your decks').click();
  await expect(page.getByRole('heading', { level: 1, name: 'My Decks' })).toBeVisible();

  await tabTo(page, page.getByRole('button', { name: /New deck/ }).first());
  await page.keyboard.press('Enter');
  const createDialog = page.getByRole('dialog', { name: 'Create a deck' });
  await expect(createDialog.getByPlaceholder('Untitled Deck')).toBeFocused();
  await page.keyboard.type('Keyboard Brew');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Untitled Deck')).toHaveValue('Keyboard Brew', { timeout: 15_000 });

  const quickAdd = page.getByRole('combobox', { name: 'Quick add a card' });
  await tabTo(page, quickAdd);
  await page.keyboard.type('Fore');
  await expect(page.getByRole('option', { name: 'Forest' })).toHaveAttribute('aria-selected', 'true');
  await expect(quickAdd).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  const forest = page.getByRole('row', { name: /× Forest$/ });
  await expect(forest).toHaveAccessibleName('1 × Forest');

  await tabTo(page, forest);
  await page.keyboard.press('Equal');
  await page.keyboard.press('Equal');
  await expect(forest).toHaveAccessibleName('3 × Forest');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(forest).toHaveAccessibleName('2 × Forest');
  await expect(forest).toBeFocused();

  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Actions for Forest' });
  await expect(menu.getByRole('menuitem', { name: /Add one/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(forest).toHaveAccessibleName('3 × Forest');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(forest).toBeFocused();

  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  await tabTo(page, quickAdd);
  await page.keyboard.type('Fore');
  const suggestion = page.getByRole('listbox', { name: 'Card suggestions' }).getByRole('option', { name: 'Forest' });
  await expect(suggestion).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(quickAdd).toHaveAttribute('aria-expanded', 'false');
  await expect(quickAdd).not.toHaveAttribute('aria-activedescendant');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: /× Fore$/ })).toHaveAccessibleName('1 × Fore');
  await expect(forest).toHaveAccessibleName('3 × Forest');

  if (!SERVER_IS_3_1) {
    return;
  }

  const shareButton = page.getByRole('button', { name: /^Share deck/ });
  await tabTo(page, shareButton);
  await page.keyboard.press('Enter');
  const shareDialog = page.getByRole('dialog', { name: 'Share deck' });
  await expect(shareDialog.getByRole('textbox', { name: /^Share name/ })).toBeFocused();
  await page.keyboard.press('Enter');
  const link = shareDialog.getByRole('textbox', { name: 'Share link' });
  await expect(link).toBeFocused({ timeout: 15_000 });
  await expect(link).toHaveValue(/share=/);
  await page.keyboard.press('Escape');
  await expect(shareDialog).toHaveCount(0);
  await expect(shareButton).toBeFocused();
});
