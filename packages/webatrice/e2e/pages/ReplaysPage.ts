import { expect, type Download, type Locator, type Page } from '@playwright/test';

export class ReplaysPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.getByRole('button', { name: /^replays$/i }).click();
    await expect(this.serverPane).toBeVisible();
  }

  get serverPane(): Locator {
    return this.page.getByRole('region', { name: 'Server replay storage' });
  }

  get localPane(): Locator {
    return this.page.getByRole('region', { name: 'Local replays' });
  }

  matchRow(gameName: string): Locator {
    return this.serverPane.locator('tr[data-testid^="replay-match-"]').filter({ hasText: gameName });
  }

  async expandMatch(gameName: string): Promise<Locator> {
    const row = this.matchRow(gameName);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Show replays' }).click();
    const replay = this.serverPane.locator('tr[data-testid^="replay-"]:not([data-testid^="replay-match-"])').first();
    await expect(replay).toBeVisible();
    return replay;
  }

  serverAction(name: string): Locator {
    return this.serverPane.getByRole('button', { name, exact: true });
  }

  async downloadSelected(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.serverAction('Download replay').click(),
    ]);
    return download;
  }

  get controls(): Locator {
    return this.page.getByTestId('replay-controls');
  }

  get time(): Locator {
    return this.page.getByTestId('replay-time');
  }

  get timeline(): Locator {
    return this.page.getByTestId('replay-timeline');
  }

  get log(): Locator {
    return this.page.getByTestId('right-panel');
  }

  async seekToFraction(fraction: number): Promise<void> {
    const box = await this.timeline.boundingBox();
    if (!box) {
      throw new Error('replay timeline is not rendered');
    }
    await this.timeline.click({ position: { x: Math.max(1, box.width * fraction), y: box.height / 2 } });
  }
}
