#!/usr/bin/env node
// Screenshot the offline Webatrice harness.
// Usage: node shoot.mjs <outDir> "<name>|<route query>|<width>x<height>[|<theme>][|<css selector>]" ...
// Example: node shoot.mjs shots "home-1440|route=home|1440x900|dark" "nav|route=home|1440x900|dark|nav"
// Env: HARNESS_URL (default http://localhost:5179/layout-tests/harness.html)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = execSync('git rev-parse --show-toplevel').toString().trim();
const require = createRequire(join(root, 'packages/webatrice/package.json'));
const { chromium } = require('playwright');

const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || specs.length === 0) {
  console.error('usage: node shoot.mjs <outDir> "<name>|<query>|<w>x<h>[|<theme>][|<selector>]" ...');
  process.exit(2);
}
const base = process.env.HARNESS_URL ?? 'http://localhost:5179/layout-tests/harness.html';
mkdirSync(outDir, { recursive: true });

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    for (const channel of ['msedge', 'chrome']) {
      try { return await chromium.launch({ channel }); } catch { continue; }
    }
    throw new Error('No browser: run `npx --prefix packages/webatrice playwright install chromium`');
  }
}

const browser = await launch();
try {
  for (const spec of specs) {
    const [name, query, size, theme = 'dark', selector] = spec.split('|');
    const [width, height] = size.split('x').map(Number);
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?${query}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('#root')?.textContent !== 'loading', null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const file = resolve(outDir, `${name}.png`);
    if (selector) {
      await page.locator(selector).first().screenshot({ path: file });
    } else {
      await page.screenshot({ path: file });
    }
    console.log(`${file}${errors.length ? `  (page errors: ${errors.join('; ')})` : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
}
