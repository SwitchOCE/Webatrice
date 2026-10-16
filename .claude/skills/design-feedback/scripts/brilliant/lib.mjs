import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const root = execSync('git rev-parse --show-toplevel').toString().trim();
export const stateDir = join(root, '.design-feedback', 'brilliant');
mkdirSync(stateDir, { recursive: true });

const configFile = join(stateDir, 'config.json');
export const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
export const saveConfig = (patch) => writeFileSync(configFile, JSON.stringify(Object.assign(config, patch), null, 2));

const url = process.env.BRILLIANT_MCP ?? config.url ?? 'http://127.0.0.1:3333/mcp';
const sessionFile = join(stateDir, 'session.json');

async function post(body, sid) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sid ? { 'Mcp-Session-Id': sid } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(`Brilliant MCP HTTP ${res.status}`), { status: res.status });
  const raw = await res.text();
  const lines = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)));
  return { msgs: lines.length ? lines : raw.trim() ? [JSON.parse(raw)] : [], sid: res.headers.get('mcp-session-id'), bytes: raw.length };
}

async function connect() {
  const { sid } = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'design-feedback', version: '1' } } });
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
  return sid;
}

let state = existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, 'utf8')) : {};

async function rawCall(name, args) {
  if (!state.sid) state = { sid: await connect() };
  let out;
  try {
    out = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, state.sid);
  } catch (e) {
    if (!e.status) throw e;
    state = { sid: await connect() };
    out = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, state.sid);
  }
  writeFileSync(sessionFile, JSON.stringify(state));
  appendFileSync(join(stateDir, 'usage.tsv'), `${new Date().toISOString()}\t${name}\tsent=${JSON.stringify(args).length}\trecv=${out.bytes}\n`);
  const result = out.msgs.map((m) => m.result ?? m.error).find(Boolean) ?? {};
  if (result.isError || out.msgs.some((m) => m.error)) {
    const text = (result.content ?? []).map((c) => c.text).join('\n') || JSON.stringify(result);
    throw new Error(`${name} failed: ${text.slice(0, 600)}`);
  }
  return result.content ?? [];
}

export async function call(name, args) {
  const content = await rawCall(name, args);
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

export async function callJson(name, args) {
  return JSON.parse(await call(name, args));
}

export async function designSession() {
  if (state.design && state.project === config.project) return state.design;
  const text = await call('init', { agentName: 'Design feedback', ...(config.project ? { project: config.project } : {}) });
  writeFileSync(join(stateDir, 'init-docs.md'), text);
  const design = text.match(/session ID: `([^`]+)`/)?.[1];
  if (!design) throw new Error('Brilliant init returned no session ID');
  Object.assign(state, { design, project: config.project });
  writeFileSync(sessionFile, JSON.stringify(state));
  return design;
}

export async function blueprint(id) {
  const d = await callJson('lookup', { scope: [id], format: 'blueprint' });
  const r = d.results?.[0];
  if (!r?.blueprint) throw new Error(`No element ${id} in Brilliant`);
  return { canvasId: r.canvasId, blueprint: r.blueprint };
}

export async function exportPng(canvasId, id, file) {
  const image = await rawCall('export', { canvasId, ids: [id], format: 'png' }).then((c) => c.find((x) => x.type === 'image'), () => null);
  const buf = image && Buffer.from(image.data, 'base64');
  const pixels = buf && buf.length > 24 ? buf.readUInt32BE(16) * buf.readUInt32BE(20) : 0;
  if (buf && pixels && buf.length / pixels > 0.01) {
    writeFileSync(file, buf);
    return file;
  }
  const svg = await call('export', { canvasId, ids: [id], format: 'svg' });
  const require = createRequire(join(root, 'packages/webatrice/package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><body style="margin:0;background:#1e1f22">${svg}</body>`, { waitUntil: 'load' });
    await page.locator('svg').first().screenshot({ path: file });
  } finally {
    await browser.close();
  }
  return file;
}

export function parseBlueprint(text) {
  const nodes = [];
  const stack = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^( *)([0-9a-f]{16}) (.*)$/);
    if (!m) continue;
    const depth = m[1].length / 2;
    const body = m[3];
    const text = body.match(/\bt\("((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
    const name = body.match(/"([^"]*)"\s*(#\w+)?\s*$/)?.[1] ?? '';
    const kind = text !== null ? 'text' : body.startsWith('inst(') ? 'inst' : /^(al|fr)\b/.test(body) ? 'frame' : body.split(/[ (]/)[0];
    const decl = body
      .replace(/hug:[\d.]+/g, 'hug')
      .replace(/ ext\([^)]*\)| p\([^)]*\)/g, '')
      .replace(/\([0-9a-f]{16},/g, '(')
      .replace(/\s*"[^"]*"\s*(#\w+)?\s*$/, '');
    const node = { id: m[2], depth, kind, text, name, decl, children: [] };
    stack.length = depth;
    if (depth > 0 && stack[depth - 1]) stack[depth - 1].children.push(node);
    else nodes.push(node);
    stack[depth] = node;
  }
  return nodes[0];
}

export const roundDir = (round) => {
  const dir = join(root, '.design-feedback', round, 'brilliant');
  mkdirSync(dir, { recursive: true });
  return dir;
};

export function args(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (spec.flags?.includes(key)) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}
