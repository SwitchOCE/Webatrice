#!/usr/bin/env node
// Report what the designer changed in Brilliant, compared with the snapshot push.mjs saved.
// Usage: node diff.mjs --round <round> --name "<frame name>" [--frame <element id of a copy or variant>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, blueprint, parseBlueprint, roundDir } from './lib.mjs';

const a = args(process.argv.slice(2), {});
const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const snap = JSON.parse(readFileSync(join(roundDir(a.round), `${slug}.json`), 'utf8'));
const before = parseBlueprint(snap.blueprint);
const after = parseBlueprint((await blueprint(a.frame ?? snap.rootId)).blueprint);

const AUTO = /^(Frame|Text|Rectangle|Path|SVG|Group|Ellipse|Line|Vector) ?\d*$/;
const label = (n) => (n.text !== null ? `"${n.text}"` : n.name && !AUTO.test(n.name) ? n.name : null);

function tokens(decl) {
  const out = {};
  let depth = 0, cur = '';
  for (const ch of `${decl} `) {
    if (ch === ' ' && depth === 0) {
      if (cur) out[cur.match(/^[a-z]+/i)?.[0] ?? cur] = cur;
      cur = '';
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    cur += ch;
  }
  return out;
}

const inner = (tok) => tok.slice(tok.indexOf('(') + 1, -1);
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function layoutParts(tok) {
  const o = {};
  for (const p of splitTop(inner(tok))) {
    const m = p.match(/^(\w+)\((.*)\)$/);
    if (!m) o.direction = p === 'h' ? 'row' : p === 'v' ? 'column' : p;
    else o[{ g: 'gap', pad: 'padding', x: 'horizontal alignment', y: 'vertical alignment' }[m[1]] ?? m[1]] = m[2];
  }
  return o;
}

function textParts(tok) {
  const [, ...rest] = splitTop(inner(tok));
  const [font, size, weight, ...more] = rest;
  return { font, 'font size': size, 'font weight': weight, ...Object.fromEntries(more.map((m) => [m.replace(/\(.*$/, ''), m])) };
}

const NAMES = { s: 'size', f: 'fill', st: 'border', rd: 'corner radius', clip: 'clip content', o: 'opacity', fx: 'effects', sh: 'shadow' };
function propChanges(b, c) {
  const tb = tokens(b.decl), ta = tokens(c.decl), out = [];
  for (const k of new Set([...Object.keys(tb), ...Object.keys(ta)])) {
    if (tb[k] === ta[k]) continue;
    if (k === 'al' && tb.al && ta.al) {
      const lb = layoutParts(tb.al), la = layoutParts(ta.al);
      for (const p of new Set([...Object.keys(lb), ...Object.keys(la)])) if (lb[p] !== la[p]) out.push(`${p} ${lb[p] ?? 'none'} → ${la[p] ?? 'none'}`);
    } else if (k === 't' && tb.t && ta.t) {
      const pb = textParts(tb.t), pa = textParts(ta.t);
      for (const p of new Set([...Object.keys(pb), ...Object.keys(pa)])) if (pb[p] !== pa[p]) out.push(`${p} ${pb[p] ?? 'none'} → ${pa[p] ?? 'none'}`);
    } else out.push(`${NAMES[k] ?? k} ${tb[k] ?? 'none'} → ${ta[k] ?? 'none'}`);
  }
  return out;
}

const textStyle = (n) => n.decl.replace(/t\("(?:[^"\\]|\\.)*"/, 't(');
const key = (n) => `${n.kind}:${n.text ?? (AUTO.test(n.name) ? '' : n.name)}`;
function sig(n) {
  if (n.kind === 'frame' && n.name === 'SVG') return 'svg';
  const kids = n.children.map(sig).filter((s, i, all) => s !== all[i - 1]);
  return `${n.kind}[${kids.join(',')}]`;
}

function align(bs, as) {
  const pairs = [], usedB = new Set(), usedA = new Set();
  const byId = new Map(as.map((x) => [x.id, x]));
  bs.forEach((b) => { const m = byId.get(b.id); if (m) { pairs.push([b, m]); usedB.add(b); usedA.add(m); } });
  const rb = bs.filter((x) => !usedB.has(x)), ra = as.filter((x) => !usedA.has(x));
  const L = Array.from({ length: rb.length + 1 }, () => Array(ra.length + 1).fill(0));
  for (let i = rb.length - 1; i >= 0; i--) for (let j = ra.length - 1; j >= 0; j--)
    L[i][j] = key(rb[i]) === key(ra[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0;
  const leftB = [], leftA = [];
  while (i < rb.length && j < ra.length) {
    if (key(rb[i]) === key(ra[j])) { pairs.push([rb[i], ra[j]]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) leftB.push(rb[i++]);
    else leftA.push(ra[j++]);
  }
  leftB.push(...rb.slice(i));
  leftA.push(...ra.slice(j));
  const removed = [], added = [];
  for (const b of leftB) {
    const k = b.kind === 'text'
      ? leftA.findIndex((x) => x.kind === 'text' && textStyle(x) === textStyle(b))
      : leftA.findIndex((x) => x.kind === b.kind);
    if (k >= 0) pairs.push([b, leftA.splice(k, 1)[0]]);
    else removed.push(b);
  }
  added.push(...leftA);
  return { pairs, removed, added };
}

const lines = [];
const parents = new Map();
(function index(n) { n.children.forEach((c) => { parents.set(c, n); index(c); }); })(before);

function where(path) {
  const named = path.map(label).filter(Boolean);
  return named.length ? named.slice(-3).join(' › ') : 'top level';
}

const size = (n) => 1 + n.children.reduce((t, c) => t + size(c), 0);
const unitName = (n) => label(n) ?? n.children.map(unitName).find(Boolean) ?? null;

function repeatNote(n) {
  for (let cur = n; parents.get(cur); cur = parents.get(cur)) {
    if (cur.kind !== 'frame' || size(cur) < 4) continue;
    const parent = parents.get(cur);
    const pool = /^Row \d+$/.test(parent.name) && parents.get(parent) ? parents.get(parent).children.flatMap((r) => r.children) : parent.children;
    const same = pool.filter((s) => sig(s) === sig(cur));
    if (same.length >= 2) return ` [in 1 of ${same.length} similar items (this one: ${unitName(cur) ?? cur.name}); ask whether it applies to all]`;
  }
  return '';
}

function compare(b, c, path) {
  const here = [...path, b];
  if (b.text !== c.text && b.text !== null && c.text !== null) lines.push(`TEXT ${where(path)}: "${b.text}" → "${c.text}"${repeatNote(b)}`);
  if (b.kind === 'frame' && b.name === 'SVG') return;
  const changes = propChanges(b, c);
  if (changes.length) lines.push(`CHANGED ${where(here)}: ${changes.join('; ')}${repeatNote(b)}`);
  if (!AUTO.test(c.name) && c.name !== b.name && c.text === null) lines.push(`RENAMED layer ${b.name} → ${c.name}`);
  const { pairs, removed, added } = align(b.children, c.children);
  const order = (list, x) => list.indexOf(x);
  const movedIdx = pairs.map(([x]) => order(b.children, x));
  const afterIdx = pairs.map(([, y]) => order(c.children, y));
  for (const [x, y] of pairs) compare(x, y, here);
  for (const r of removed) lines.push(`REMOVED ${label(r) ?? r.name} from ${where(here)}${repeatNote(r)}`);
  for (const n of added) lines.push(`ADDED ${n.text !== null ? `text "${n.text}"` : n.name} in ${where(here)}: ${n.decl.slice(0, 140)}`);
  const sortedB = [...movedIdx].sort((p, q) => p - q).join();
  const pairOrder = pairs.map((_, k) => k).sort((p, q) => afterIdx[p] - afterIdx[q]).map((k) => movedIdx[k]).join();
  if (pairs.length > 1 && sortedB !== pairOrder) lines.push(`REORDERED children of ${where(here)}: ${pairs.map(([, y]) => y).sort((p, q) => order(c.children, p) - order(c.children, q)).map((y) => label(y) ?? y.name).join(', ')}`);
}

compare(before, after, []);
const removedKeys = lines.filter((l) => l.startsWith('REMOVED')).map((l) => l.split(' from ')[0].slice(8));
const final = lines.map((l) => (l.startsWith('ADDED') && removedKeys.some((k) => l.includes(k.replace(/^"|"$/g, ''))) ? l.replace('ADDED', 'MOVED (added here, removed elsewhere)') : l));
console.log(final.length ? final.join('\n') : 'no changes');
