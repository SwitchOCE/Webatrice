#!/usr/bin/env node
// Build a region of the offline app in Brilliant as native, editable frames and save a snapshot for diff.mjs.
// Usage: node push.mjs --round <round> --name "<frame name>" --route <query> --selector "<css>" [--size 1440x900] [--theme dark] [--canvas "<canvas>"] [--steps "click:<sel>|hover:<sel>"] [--replace]
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, blueprint, callJson, config, designSession, exportPng, root, roundDir } from './lib.mjs';
import { compact, extractInPage } from './extract.mjs';

const a = args(process.argv.slice(2), { flags: ['replace'] });
for (const k of ['round', 'name', 'route', 'selector']) if (!a[k]) { console.error(`missing --${k}`); process.exit(2); }
const [width, height] = (a.size ?? '1440x900').split('x').map(Number);
const canvasId = a.canvas ?? config.canvas ?? `Design feedback/${a.round}`;
const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const serverFile = join(root, '.design-feedback/server.json');
const port = existsSync(serverFile) ? JSON.parse(readFileSync(serverFile, 'utf8')).port : 5179;
const base = `http://localhost:${port}/layout-tests/harness.html`;
const own = await fetch(new URL(`/@fs/${root.replace(/\\/g, '/')}/packages/webatrice/layout-tests/harness.html`, base)).then((r) => r.ok, () => false);
if (!own) { console.error(`No preview server for this checkout at ${base} (see references/setup.md).`); process.exit(3); }

const require = createRequire(join(root, 'packages/webatrice/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
const page = await browser.newPage({ viewport: { width, height }, colorScheme: a.theme ?? 'dark' });
await page.goto(`${base}?${a.route}`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(1200);
for (const step of (a.steps ?? '').split('|').filter(Boolean)) {
  const [kind, ...rest] = step.split(':');
  const value = rest.join(':');
  if (kind === 'click') await page.locator(value).first().click();
  if (kind === 'hover') await page.locator(value).first().hover();
  if (kind === 'press') await page.keyboard.press(value);
  await page.waitForTimeout(250);
}
const dir = roundDir(a.round);
const appShot = join(dir, `${slug}-app.png`);
await page.locator(a.selector).first().screenshot({ path: appShot });
let html = compact(await page.evaluate(extractInPage, a.selector));
await browser.close();
html = html.replace(/^<(\w+)( layer-name="[^"]*")?/, `<$1 layer-name="${a.name.replace(/"/g, '&quot;')}"`);
writeFileSync(join(dir, `${slug}.html`), html);

const sessionId = await designSession();
const snapFile = join(dir, `${slug}.json`);
if (existsSync(snapFile)) {
  const old = JSON.parse(readFileSync(snapFile, 'utf8'));
  if (!a.replace) { console.error(`"${a.name}" was already pushed (${old.rootId}). Pass --replace to delete that frame and push again; any edits on it are lost.`); process.exit(4); }
  await callJson('create_modify_elements', { canvasId: old.canvasId, sessionId, designSystem: 'none', elements: `delete(${old.rootId})` }).catch(() => null);
}
const created = await callJson('create_html', { canvasId, sessionId, html, requestId: `push-${slug}-${Date.now()}` });
const rootId = created.affectedIds?.[0]?.id;
if (!rootId) { console.error(`create_html returned no frame: ${JSON.stringify(created).slice(0, 400)}`); process.exit(1); }
const snap = await blueprint(rootId);
writeFileSync(snapFile, JSON.stringify({
  name: a.name, canvasId: snap.canvasId, rootId, route: a.route, selector: a.selector, size: `${width}x${height}`,
  theme: a.theme ?? 'dark', createdAt: new Date().toISOString(), blueprint: snap.blueprint,
}, null, 1));
const brilliantShot = await exportPng(snap.canvasId, rootId, join(dir, `${slug}-brilliant.png`));
const warnings = (created.warnings ?? []).filter((w) => !w.startsWith('ℹ') && !/fully cover|named "SVG"|may be collapsed/.test(w));
console.log(JSON.stringify({ frame: a.name, canvas: snap.canvasId, rootId, elements: created.count, appShot, brilliantShot, warnings: warnings.map((w) => w.slice(0, 160)) }, null, 1));
