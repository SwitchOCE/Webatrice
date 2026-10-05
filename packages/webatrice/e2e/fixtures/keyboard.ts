import type { Locator, Page } from '@playwright/test';

// Press Tab (Shift+Tab when the target comes earlier in the document) until
// `target` has focus, proving it is in the tab order. Never relies on
// wrapping past the end of the page: Firefox wraps into the browser chrome.
export async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  await target.waitFor();
  for (let i = 0; i < maxPresses; i++) {
    const position = await target.evaluate((element) => {
      const active = document.activeElement;
      if (element === active) {
        return 'focused';
      }
      if (!active || active === document.body) {
        return 'after';
      }
      return active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING ? 'before' : 'after';
    });
    if (position === 'focused') {
      return;
    }
    await page.keyboard.press(position === 'before' ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Tab never reached ${target}`);
}
