// Design preview only: screenshots the preview entry with the installed Edge.
// usage: node preview-shots.mjs <outDir> <name>:<query>:<w>x<h> [...]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const [outDir, ...jobs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
let browser = await chromium.launch({ channel: 'msedge' });
// Scryfall asks for <=10 requests/s and rejects bursts; a fresh page asks for 100+
// images at once. Serve api.scryfall.com through a throttled, disk-cached fetcher.
const CACHE = process.env.SCRY_CACHE || path.join(process.env.LOCALAPPDATA || '.', 'webatrice-preview-scryfall');
fs.mkdirSync(CACHE, { recursive: true });
let chain = Promise.resolve();
const throttle = () => (chain = chain.then(() => new Promise((r) => setTimeout(r, 160))));
const keyOf = (u) => u.replace(/[^a-z0-9]+/gi, '_').slice(-180);
async function scry(url) {
  const k = path.join(CACHE, keyOf(url));
  if (fs.existsSync(k + '.bin')) return { body: fs.readFileSync(k + '.bin'), type: fs.readFileSync(k + '.type', 'utf8'), status: 200 };
  for (let attempt = 0; attempt < 10; attempt++) {
    await throttle();
    let res;
    try { res = await fetch(url, { headers: { 'User-Agent': 'WebatriceDesignPreview/1.0', Accept: '*/*' }, signal: AbortSignal.timeout(20000) }); }
    catch { await new Promise((r) => setTimeout(r, 1000)); continue; }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2500)); continue; }
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'application/octet-stream';
    if (res.ok) { fs.writeFileSync(k + '.bin', body); fs.writeFileSync(k + '.type', type); }
    return { body, type, status: res.status };
  }
  return { body: Buffer.from(''), type: 'text/plain', status: 429 };
}
async function routeScryfall(page) {
  await page.route(/https:\/\/(api|cards|backs)\.scryfall\.(com|io)\//, async (route) => {
    const r = await scry(route.request().url());
    await route.fulfill({ status: r.status, body: r.body, headers: { 'content-type': r.type, 'access-control-allow-origin': '*' } });
  });
}
async function shoot(job) {
  const [name, query, size] = job.split(':');
  const [w, h] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await routeScryfall(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:5179/preview.html?${query}`, { waitUntil: 'networkidle', timeout: 90000 });
  // let images that redirect through Scryfall settle
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
  console.log(name, w + 'x' + h, 'images', await page.evaluate(() => document.images.length), 'broken', broken, errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : '');
  await page.close();
}
for (const job of jobs) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await shoot(job); break; } catch (e) {
      console.log(job.split(':')[0], 'retry after:', String(e.message).split(/\r?\n/)[0]);
      try { await browser.close(); } catch {}
      browser = await chromium.launch({ channel: 'msedge' });
    }
  }
}
await browser.close();
