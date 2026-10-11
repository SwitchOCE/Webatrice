import { expect, test } from '@playwright/test';

import { dockReport, overlaps } from '../fixtures/geometry';
import { openChats, openHarness } from '../fixtures/harness';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const CASES = [
  { open: 1, minimised: 1 },
  { open: 2, minimised: 0 },
  { open: 3, minimised: 1 },
] as const;
const ROUTES = ['home', 'game'] as const;
const WINDOW_SLOT_PX = 308;
const RESERVED_PX = 480;
const maxOpen = (width: number) => Math.max(1, Math.min(3, Math.floor((width - RESERVED_PX) / WINDOW_SLOT_PX)));

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const { open, minimised } of CASES) {
      const title = `${route} ${viewport.width}x${viewport.height}: ${open} open + ${minimised} minimised chats tile in one bottom row`;
      test(title, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openHarness(page, { route, players: 4 });
        await openChats(page, open, minimised);
        const report = await dockReport(page);
        const windows = report.items.filter((item) => item.kind === 'window');
        const chips = report.items.filter((item) => item.kind === 'chip');
        const expectedOpen = Math.min(open, maxOpen(viewport.width));
        expect(windows.length, 'open windows').toBe(expectedOpen);
        expect(chips.length, 'minimised chips').toBe(open + minimised - expectedOpen);

        const failures: string[] = [];
        for (const item of report.items) {
          if (Math.abs(item.bottom - viewport.height) > 1.5) {
            failures.push(`${item.kind} ${item.name}: bottom ${Math.round(item.bottom)} is off the bottom edge ${viewport.height}`);
          }
          if (!item.reachable) {
            failures.push(`${item.kind} ${item.name}: [${Math.round(item.left)}–${Math.round(item.right)}] is off screen`);
          }
          if (report.gameInput && overlaps(item, report.gameInput)) {
            failures.push(`${item.kind} ${item.name}: covers the game chat input`);
          }
        }
        report.items.forEach((a, i) => report.items.slice(i + 1).forEach((b) => {
          const sideBySide = a.right <= b.left + 1.5 || b.right <= a.left + 1.5;
          if (!sideBySide) {
            failures.push(`${a.kind} ${a.name} and ${b.kind} ${b.name} are stacked, not side by side`);
          }
        }));
        expect(failures).toEqual([]);
      });
    }
  }
}
