#!/usr/bin/env node
// Export the designer's final frames of a round as PNGs for the PR: every pushed frame they edited, and every new frame (copies, variants).
// Writes <round>/brilliant/final/<frame>-<id>.png and final.json (project, backing, canvas and frame ids).
// Usage: node final.mjs --round <round> [--all]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, blueprint, callJson, config, exportPng, root, roundDir } from './lib.mjs';

const a = args(process.argv.slice(2), { flags: ['all'] });
if (!a.round) { console.error('missing --round'); process.exit(2); }
const dir = roundDir(a.round);
const out = join(dir, 'final');
mkdirSync(out, { recursive: true });
const snaps = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
if (!snaps.length) { console.error(`No pushed frames for round ${a.round}.`); process.exit(1); }

const projects = (await callJson('list_projects', {})).projects;
const p = projects.find((x) => x.name === config.project) ?? {};
const project = { name: config.project, backing: p.backing ?? 'unknown', folder: p.key, handle: p.handle };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shape = (bp) => bp.replace(/^([0-9a-f]{16} [^\n]*?) p\([^)]*\)/, '$1');
const { chromium } = createRequire(join(root, 'packages/webatrice/package.json'))('playwright');
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
async function flatten(file, theme) {
  const page = await browser.newPage();
  const src = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  await page.setContent(`<!doctype html><body style="margin:0;background:${theme === 'light' ? '#ffffff' : '#1e1f22'}"><img src="${src}" style="display:block">`, { waitUntil: 'load' });
  await page.locator('img').screenshot({ path: file });
  await page.close();
}

const frames = [];
const seen = new Set();
for (const canvasId of [...new Set(snaps.map((s) => s.canvasId))]) {
  const d = await callJson('lookup', { scope: [canvasId], format: 'summary' });
  for (const e of d.results?.[0]?.elements ?? []) {
    seen.add(e.id);
    const snap = snaps.find((s) => s.rootId === e.id);
    const origin = snap ?? snaps.find((s) => e.name.startsWith(s.name));
    const from = origin?.name ?? null;
    let status = snap ? 'edited' : 'new';
    if (snap && shape((await blueprint(e.id, canvasId)).blueprint) === shape(snap.blueprint)) status = 'unchanged';
    if (status === 'unchanged' && !a.all) { console.log(`UNCHANGED ${e.name} (${e.id})`); continue; }
    const file = await exportPng(canvasId, e.id, join(out, `${slug(e.name)}-${e.id.slice(0, 6)}.png`));
    await flatten(file, origin?.theme);
    frames.push({ name: e.name, id: e.id, canvasId, status, from, file });
    console.log(`${status.toUpperCase()} ${e.name} (${e.id}) -> ${file}`);
  }
}
await browser.close();
for (const s of snaps) if (!seen.has(s.rootId)) console.log(`MISSING "${s.name}" (${s.rootId}): deleted or moved to another canvas`);
writeFileSync(join(out, 'final.json'), JSON.stringify({ round: a.round, exportedAt: new Date().toISOString(), project, frames }, null, 1));
console.log(`PROJECT "${project.name}" ${project.backing}${project.handle ? ` handle ${project.handle}` : ''}; canvases: ${[...new Set(frames.map((f) => f.canvasId))].join(', ')}`);
if (project.backing === 'local') console.log(`SHARE: the project lives only in ${project.folder} on this machine. Ask the designer to make it a synced or cloud project in Brilliant and share it with the repo owner, or to send that folder.`);
