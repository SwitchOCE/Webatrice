import { expect, test } from '../fixtures/test';
import { registerAndJoinFirstRoom } from '../fixtures/flows';
import { randomSuffix } from '../fixtures/users';

// Settings › Chat "Enable mention completer" (on by default, as on desktop): typing
// `@` in room chat suggests the room's users. Driven by the keyboard only — the
// combobox must be usable without a pointer.

test('completes an @mention in room chat from the keyboard', async ({ page }) => {
  const { user } = await registerAndJoinFirstRoom(page);

  const input = page.getByPlaceholder(/^Message /);
  await input.focus();
  // The registering user is in the room's user list; their full name is unique per run.
  const prefix = `@${user.username.slice(0, -1)}`;
  await page.keyboard.type(prefix);

  const suggestions = page.getByRole('listbox', { name: /mention suggestions/i });
  await expect(suggestions).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(suggestions.getByRole('option', { name: `@${user.username}` })).toHaveAttribute('aria-selected', 'true');

  // Escape closes the list and keeps the text.
  await page.keyboard.press('Escape');
  await expect(suggestions).toBeHidden();
  await expect(input).toHaveValue(prefix);

  // Typing again reopens it; Enter inserts the mention instead of sending.
  await page.keyboard.press('Backspace');
  await page.keyboard.type(user.username.slice(-2, -1));
  await expect(suggestions).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(suggestions).toBeHidden();
  await expect(input).toHaveValue(`@${user.username} `);

  // With the list closed, Enter sends the message.
  const text = `hello-${randomSuffix()}`;
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByText(new RegExp(text)).first()).toBeVisible();
});
