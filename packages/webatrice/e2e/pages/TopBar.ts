import type { Locator, Page } from '@playwright/test';

// The TopBar's open tabs (Lobby, rooms, games, replays, pages) are links in a
// `<nav aria-label="Open tabs">`; the current one carries aria-current="page".
export function topBarTab(page: Page, name?: string | RegExp): Locator {
  return page.getByRole('navigation', { name: /^open tabs$/i }).getByRole('link', name != null ? { name } : {});
}
