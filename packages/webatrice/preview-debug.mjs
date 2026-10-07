import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log(m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.goto('http://localhost:5179/preview.html?' + process.argv[2], { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1500);
await browser.close();
