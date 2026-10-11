import { expect, test } from '@playwright/test';

import { boardReport, dockReport, overlaps } from '../fixtures/geometry';
import { openChats, openHarness, settle, showCardInPreview } from '../fixtures/harness';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2000, height: 1125 },
];
const PLAYER_COUNTS = [2, 3, 4, 6];
const SEATS = ['player', 'spectator'] as const;
const PREVIEW = ['empty', 'showing a card'] as const;

for (const players of PLAYER_COUNTS) {
  for (const as of SEATS) {
    for (const preview of PREVIEW) {
      test(`${players} players, as ${as}, preview ${preview}: every seat fits its pane`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS[0]);
        await openHarness(page, { players, as, previewMode: preview === 'empty' ? 'image' : 'both' });
        if (preview !== 'empty') {
          await showCardInPreview(page);
        }
        const failures: string[] = [];
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport);
          await settle(page);
          const report = await boardReport(page);
          expect(report.seats, `${viewport.width}x${viewport.height} seats`).toBe(players);
          expect(report.cards, `${viewport.width}x${viewport.height} cards`).toBeGreaterThan(players * 15);
          failures.push(...report.violations.map((v) => `${viewport.width}x${viewport.height}: ${v}`));
        }
        expect(failures).toEqual([]);
      });
    }
  }
}

for (const as of SEATS) {
  test(`as ${as}: the chat dock sits on the bottom edge beside the game sidebar`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[0]);
    await openHarness(page, { players: 4, as, previewMode: 'both' });
    await openChats(page, 1);
    const failures: string[] = [];
    for (const preview of PREVIEW) {
      if (preview !== 'empty') {
        await showCardInPreview(page);
      }
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await settle(page);
        const report = await dockReport(page);
        const where = `${viewport.width}x${viewport.height}, preview ${preview}`;
        const windows = report.items.filter((item) => item.kind === 'window');
        if (windows.length !== 1) {
          failures.push(`${where}: expected one chat window, found ${windows.length}`);
          continue;
        }
        const [chat] = windows;
        if (Math.abs(chat.bottom - viewport.height) > 1.5) {
          failures.push(`${where}: chat window bottom ${Math.round(chat.bottom)} is not on the viewport bottom ${viewport.height}`);
        }
        if (!report.gameInput) {
          failures.push(`${where}: no game chat input`);
        } else if (overlaps(chat, report.gameInput)) {
          failures.push(`${where}: chat window covers the game chat input`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
}
