import { expect, test } from '../fixtures/test';

import { registerAndReachRooms } from '../fixtures/flows';

test('deck folders, undo/redo and autosave round-trip through Servatrice', async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndReachRooms(page);

  await page.getByTitle('View your decks').click();
  await expect(page.getByRole('heading', { level: 1, name: 'My Decks' })).toBeVisible();

  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByRole('textbox', { name: 'Name of new folder:' }).fill('Tournament');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByText('Tournament', { exact: true }).click();
  const breadcrumb = page.getByRole('navigation', { name: 'Folder' });
  await expect(breadcrumb.getByRole('button', { name: 'Tournament' })).toHaveAttribute('aria-current', 'location');

  await page.getByRole('button', { name: /New deck/ }).first().click();
  await page.getByPlaceholder('Untitled Deck').fill('E2E Brew');
  await page.getByRole('button', { name: 'Create' }).click();
  const name = page.getByPlaceholder('Untitled Deck');
  await expect(name).toHaveValue('E2E Brew', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();

  await name.fill('E2E Brew v2');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(name).toHaveValue('E2E Brew');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  const format = page.getByRole('combobox', { name: 'Format' });
  await format.selectOption('legacy');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(format).toHaveValue('commander');
  await page.keyboard.press('Control+y');
  await expect(format).toHaveValue('legacy');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });

  const deckRow = page.getByRole('button', { name: /^E2E Brew / });
  await page.getByTitle('View your decks').click();
  await page.getByText('Tournament', { exact: true }).click();
  await expect(deckRow).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Move E2E Brew to another folder' }).click();
  await page.getByRole('combobox', { name: 'To folder' }).selectOption({ label: 'Server deck storage' });
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('This folder is empty.')).toBeVisible({ timeout: 15_000 });

  await breadcrumb.getByRole('button', { name: /Server deck storage/ }).click();
  await expect(deckRow).toBeVisible();

  await page.getByRole('button', { name: 'Delete Tournament' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Tournament', { exact: true })).toHaveCount(0, { timeout: 15_000 });
});
