#!/usr/bin/env node
// List the top-level frames on a round's canvas: the ones push.mjs made, and new ones (the designer's copies or variants).
// Usage: node frames.mjs --round <round> [--canvas "<canvas>"]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, callJson, config, roundDir } from './lib.mjs';

const a = args(process.argv.slice(2), {});
const dir = roundDir(a.round);
const snaps = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const canvasId = a.canvas ?? snaps[0]?.canvasId ?? config.canvas ?? `Design feedback/${a.round}`;
const d = await callJson('lookup', { scope: [canvasId], format: 'summary' });
const elements = d.results?.[0]?.elements ?? [];
const pushed = new Map(snaps.map((s) => [s.rootId, s.name]));
for (const e of elements) {
  if (pushed.has(e.id)) console.log(`${e.id}  ${e.name}  (pushed: --name "${pushed.get(e.id)}")`);
  else {
    const guess = snaps.find((s) => e.name === s.name || e.name.startsWith(s.name));
    console.log(`${e.id}  ${e.name}  (new${guess ? `, probably a copy of "${guess.name}": diff with --name "${guess.name}" --frame ${e.id}` : ''})`);
  }
}
for (const s of snaps) if (!elements.some((e) => e.id === s.rootId)) console.log(`missing: "${s.name}" (${s.rootId}) was deleted or moved to another canvas`);
