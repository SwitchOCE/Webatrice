#!/usr/bin/env node
// Screenshot the offline Webatrice harness.
// Usage: node shoot.mjs <outDir> "<name>|<route query>|<width>x<height>[|<theme>][|<css selector>][|<step>...]" ...
// Steps run in order before the shot: click:<selector>, hover:<selector>, press:<key>, wait:<ms>.
// clip:<x>,<y>,<w>,<h> crops to a region of the viewport instead of an element; scale:<n> zooms (pixel density).
// Example: node shoot.mjs shots "nav-collapsed|route=home|1440x900|dark|clip:0,0,80,48|scale:4|click:#nav-rail-toggle"
// The server URL comes from HARNESS_URL, else .design-feedback/server.json ({ "port": n }), else port 5179.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = execSync('git rev-parse --show-toplevel').toString().trim();
const require = createRequire(join(root, 'packages/webatrice/package.json'));
const { chromium } = require('playwright');

const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || specs.length === 0) {
  console.error('usage: node shoot.mjs <outDir> "<name>|<query>|<w>x<h>[|<theme>][|<selector>][|click:<sel>|hover:<sel>|press:<key>|wait:<ms>|clip:x,y,w,h|scale:n]" ...');
  process.exit(2);
}

const serverFile = join(root, '.design-feedback/server.json');
const port = existsSync(serverFile) ? JSON.parse(readFileSync(serverFile, 'utf8')).port : 5179;
const base = process.env.HARNESS_URL ?? `http://localhost:${port}/layout-tests/harness.html`;

if (!process.env.HARNESS_URL) {
  const up = await fetch(base).then((r) => r.ok, () => false);
  if (!up) {
    console.error(`No preview server at ${base}. Start it from packages/webatrice (see references/setup.md).`);
    process.exitCode = 3;
  }
  const own = up && await fetch(new URL(`/@fs/${root.replace(/\\/g, '/')}/packages/webatrice/layout-tests/harness.html`, base))
    .then((r) => r.ok, () => false);
  if (up && !own) {
    console.error(`The server at ${base} is serving a different checkout. Start one from ${root} on a free port and record it in .design-feedback/server.json.`);
    process.exitCode = 3;
  }
}

async function shoot() {
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

  const isStep = (field) => /^(click|hover|press|wait):/.test(field);
  const isClip = (field) => field.startsWith('clip:');
  const isScale = (field) => field.startsWith('scale:');

  const browser = await launch();
  try {
    for (const spec of specs) {
      const fields = spec.split('|');
      const [name, query, size] = fields;
      const rest = fields.slice(3);
      const options = rest.filter((f) => !isStep(f) && !isClip(f) && !isScale(f));
      const scale = Number(rest.find(isScale)?.slice(6) ?? 1);
      const clipField = rest.find(isClip);
      const clip = clipField && Object.fromEntries(clipField.slice(5).split(',').map(Number).map((v, i) => [['x', 'y', 'width', 'height'][i], v]));
      const steps = rest.filter(isStep);
      const [theme = 'dark', selector] = options;
      const [width, height] = size.split('x').map(Number);
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: scale });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(query ? `${base}?${query}` : base, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(() => document.querySelector('#root')?.textContent !== 'loading', null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      for (const step of steps) {
        const [kind, ...arg] = step.split(':');
        const value = arg.join(':');
        if (kind === 'click') await page.locator(value).first().click();
        if (kind === 'hover') await page.locator(value).first().hover();
        if (kind === 'press') await page.keyboard.press(value);
        if (kind === 'wait') await page.waitForTimeout(Number(value));
        await page.waitForTimeout(200);
      }
      const file = resolve(outDir, `${name}.png`);
      if (clip) {
        await page.screenshot({ path: file, clip });
      } else if (selector && selector !== 'body') {
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
}

if (!process.exitCode) await shoot();
