#!/usr/bin/env node
// Check that Brilliant is running with its MCP server on, and choose the project to work in.
// Usage: node check.mjs [--project "<name>"]
import { args, callJson, config, saveConfig } from './lib.mjs';

const a = args(process.argv.slice(2), {});
let projects;
try {
  projects = (await callJson('list_projects', {})).projects;
} catch (e) {
  console.log(`NOT READY: can't reach Brilliant's MCP server (${e.cause?.code ?? e.message}). Ask the designer to open Brilliant and turn on its MCP server in Brilliant's settings, then run this again.`);
  process.exit(1);
}
if (a.project) {
  const p = projects.find((x) => x.name === a.project || x.key === a.project);
  if (!p) { console.log(`NOT READY: no Brilliant project named "${a.project}". Projects: ${projects.map((x) => x.name).join(', ')}`); process.exit(1); }
  saveConfig({ project: p.name });
}
if (!config.project) {
  const p = projects.find((x) => /webatrice/i.test(x.name));
  if (p) saveConfig({ project: p.name });
}
if (!config.project) {
  console.log(`CHOOSE: no project picked yet. Ask the designer which one to use (or to create a project called "Webatrice" in Brilliant), then run with --project. Projects: ${projects.map((x) => `${x.name} (${x.openState})`).join(', ')}`);
  process.exit(1);
}
console.log(`READY: Brilliant is running; project "${config.project}".`);
