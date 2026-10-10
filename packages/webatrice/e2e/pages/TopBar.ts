import type { Locator, Page } from '@playwright/test';

export function topBarTab(page: Page, name?: string | RegExp): Locator {
  return page.getByRole('navigation', { name: /^open tabs$/i }).getByRole('link', name != null ? { name } : {});
}
