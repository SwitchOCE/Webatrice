import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const jobs = process.argv.slice(2);
for (const job of jobs) {
  const [q, size] = job.split('|');
  const [w, h] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route(/scryfall/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('http://localhost:5179/preview.html?' + q, { waitUntil: 'load', timeout: 60000 }); await page.waitForSelector('[data-card-key], .game__board-grid', { timeout: 60000, state: 'attached' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[data-card-key]')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > b.width);
    const root = getComputedStyle(document.documentElement);
    const cw = root.getPropertyValue('--card-width'), ch = root.getPropertyValue('--card-height');
    const min = t.length ? t.reduce((a, b) => (b.height < a.height ? b : a)) : null;
    const max = t.length ? t.reduce((a, b) => (b.height > a.height ? b : a)) : null;
    return { classic: cw ? `${cw} x ${ch}` : null, table: min ? `${Math.round(min.width)}x${Math.round(min.height)} .. ${Math.round(max.width)}x${Math.round(max.height)}` : null };
  });
  console.log(q, size, JSON.stringify(r));
  await page.close();
}
await browser.close();
