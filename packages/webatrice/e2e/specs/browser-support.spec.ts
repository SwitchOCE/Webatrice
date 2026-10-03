import { expect, test } from '../fixtures/test';

import { LoginPage } from '../pages';

// Startup capability preflight (src/utils/browserSupport.ts) in a real
// browser. An init script blanks one API before the bundle runs, standing in
// for a browser that lacks it; jsdom unit specs cover the full feature table.

test('a browser without WebSocket gets the unsupported screen instead of the app', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebSocket', { value: undefined, configurable: true, writable: true });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Unsupported Browser' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveText(['WebSockets, used to connect to the server']);
  // The app did not boot: no login screen behind it.
  await expect(new LoginPage(page).hostPicker).toBeHidden();
});

test('a browser without an optional API boots with a notice naming it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true, writable: true });
  });

  const login = new LoginPage(page);
  await login.goto();

  await expect(page.getByRole('alert').filter({ hasText: 'Some features are unavailable in this browser' }))
    .toContainText('Broadcast channels, used by the pop-out card preview');
});
