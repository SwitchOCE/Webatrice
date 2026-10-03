import { expect, test } from '../fixtures/test';

import { registerAndReachRooms } from '../fixtures/flows';

// Deck storage folders and deck-editor undo against a real Servatrice. The
// integration suite pins the commands these screens send; this spec checks
// the server actually accepts them: a folder is created, a deck is created
// inside it, edits and their undo are saved as deck-id updates, and the deck
// moves back to the root before the folder is deleted.

test('deck folders, undo/redo and autosave round-trip through Servatrice', async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndReachRooms(page);

  await page.getByTitle('View your decks').click();
  await expect(page.getByRole('heading', { level: 1, name: 'My Decks' })).toBeVisible();

  // New folder at the root, then open it.
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByRole('textbox', { name: 'Name of new folder:' }).fill('Tournament');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByText('Tournament', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tournament' })).toHaveAttribute('aria-current', 'location');

  // A deck created here lands in the folder and opens in the editor.
  await page.getByRole('button', { name: /New deck/ }).first().click();
  await page.getByPlaceholder('Untitled Deck').fill('E2E Brew');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/deck\/\d+$/, { timeout: 15_000 });
  const name = page.getByPlaceholder('Untitled Deck');
  await expect(name).toHaveValue('E2E Brew', { timeout: 15_000 });

  // Rename, then undo: each state is saved to the server as an update.
  await name.fill('E2E Brew v2');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(name).toHaveValue('E2E Brew');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Keyboard undo/redo of a format change, from outside any text field.
  const format = page.getByRole('combobox', { name: 'Format' });
  await format.selectOption('legacy');
  // Shortcuts skip text fields and selects, so leave the picker first.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(format).toHaveValue('commander');
  await page.keyboard.press('Control+y');
  await expect(format).toHaveValue('legacy');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Back in My Decks the server's copy carries the undone name, inside the folder.
  await page.getByTitle('View your decks').click();
  await page.getByText('Tournament', { exact: true }).click();
  await expect(page.getByText('E2E Brew', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Move it to the root: copy uploaded there, original deleted.
  await page.getByRole('button', { name: 'Move E2E Brew to another folder' }).click();
  await page.getByRole('combobox', { name: 'To folder' }).selectOption({ label: 'Server deck storage' });
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('This folder is empty.')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Server deck storage/ }).click();
  await expect(page.getByText('E2E Brew', { exact: true })).toBeVisible();

  // Delete the now-empty folder.
  await page.getByRole('button', { name: 'Delete Tournament' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Tournament', { exact: true })).toHaveCount(0, { timeout: 15_000 });
});
