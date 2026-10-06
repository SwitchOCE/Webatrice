// Key-integrity gate for the i18n catalogue (`npm run i18n:check`).
//
// The English source catalogue is the merge of every co-located `*.i18n.json`
// under `src/` (prebuild.js writes it to `src/i18n-default.json`). A missing key
// renders as the raw key and an orphan key ships dead text to Transifex, and
// neither fails a build or a test, so this script checks, over all non-spec
// sources:
//
//   1. every literal `t('A.b')` / `i18nKey="A.b"` / `labelKey: 'A.b'` resolves to
//      a message (and never hides a miss behind `defaultValue`);
//   2. every template key `t(`A.b.${x}`)` has at least one key under its prefix;
//   3. every catalogue key is reached from source (allowlist: i18n-allowlist.json);
//   4. every English message is valid ICU;
//   5. the committed `src/i18n-default.json` is byte for byte a fresh merge in
//      prebuild.js's sorted path order, so key-order drift fails too;
//   6. the `public/locales/*` folders are exactly the `Language` enum values.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { IntlMessageFormat } from 'intl-messageformat';

const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIPPED_SOURCES = /(\.spec\.tsx?$|\/__test-utils__\/|\/__mocks__\/|\.d\.ts$)/;
const CATALOG_FILE = /\.i18n\.json$/;
// Only these call shapes take a key; `t` is the `useTranslation()` binding and
// `i18n.t` / `i18next.t` the module-level instance.
const KEY_PROPERTY = /Key$/;

/** Flattens a nested catalogue into `{ 'A.b.c': message }`. */
export function flattenCatalog(json, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(json)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flattenCatalog(value, id, out);
    } else {
      out[id] = value;
    }
  }
  return out;
}

/** The order prebuild.js merges catalogues in: by POSIX path, compared by code unit. */
export function compareCatalogPaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The rollup exactly as prebuild.js writes it. */
export function serializeRollup(merged) {
  return JSON.stringify(merged, null, 2);
}

/** Merges catalogue files the way prebuild.js does: a repeated top-level namespace is an error. */
export function mergeCatalogs(files) {
  const merged = {};
  const problems = [];
  for (const { file, json } of files) {
    for (const [namespace, value] of Object.entries(json)) {
      if (namespace in merged) {
        problems.push(`${file}: namespace "${namespace}" is already defined in another *.i18n.json`);
        continue;
      }
      merged[namespace] = value;
    }
  }
  return { merged, problems };
}

function isTranslateCall(node) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === 't';
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 't';
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyName(node) {
  const name = node.name;
  if (!name) {
    return undefined;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/**
 * Scans one source file for key references.
 *
 * - `keys`: literal keys that must resolve (t() / i18nKey / `*Key` props).
 * - `prefixes`: static heads of template keys (`A.b.` from `A.b.${x}`).
 * - `tails`: static rests of fully dynamic template keys (`.count` from `${p}.count`),
 *   matched against string literals to find the keys they reach.
 * - `strings` / `heads`: every string literal and template head, which reach keys
 *   passed around as data (`labelKey: 'A.b'`, `label: `A.steps.${key}``).
 * - `defaultValues`: literal keys called with a `defaultValue` option.
 */
export function scanSource(file, text) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const result = { keys: [], prefixes: [], tails: [], heads: new Set(), strings: new Set(), defaultValues: [] };

  const addKey = (key, node, via) => result.keys.push({ key, file, line: lineOf(sourceFile, node), via });

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      result.strings.add(node.text);
    } else if (ts.isTemplateExpression(node) && node.head.text) {
      // A key built as data and translated elsewhere (`label: `A.steps.${key}``).
      result.heads.add(node.head.text);
    }

    if (ts.isCallExpression(node) && isTranslateCall(node) && node.arguments.length > 0) {
      const [first, options] = node.arguments;
      if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
        addKey(first.text, first, 't()');
        const hasDefault = options && ts.isObjectLiteralExpression(options)
          && options.properties.some((p) => propertyName(p) === 'defaultValue');
        if (hasDefault) {
          result.defaultValues.push({ key: first.text, file, line: lineOf(sourceFile, first) });
        }
      } else if (ts.isTemplateExpression(first)) {
        const head = first.head.text;
        if (head) {
          result.prefixes.push({ prefix: head, file, line: lineOf(sourceFile, first) });
        } else if (first.templateSpans.length === 1) {
          result.tails.push(first.templateSpans[0].literal.text);
        }
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sourceFile);
      if (name === 'i18nKey') {
        addKey(node.initializer.text, node.initializer, 'i18nKey');
      } else if (KEY_PROPERTY.test(name)) {
        addKey(node.initializer.text, node.initializer, name);
      }
    }

    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = propertyName(node);
      if (name && KEY_PROPERTY.test(name)) {
        addKey(node.initializer.text, node.initializer, name);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

/** Reads the members of `export enum Language` from `src/types/languages.ts`. */
export function readLanguageEnum(text) {
  const sourceFile = ts.createSourceFile('languages.ts', text, ts.ScriptTarget.Latest, true);
  const values = [];
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isEnumDeclaration(node) && node.name.text === 'Language') {
      for (const member of node.members) {
        if (member.initializer && ts.isStringLiteral(member.initializer)) {
          values.push(member.initializer.text);
        }
      }
    }
  });
  return values;
}

/**
 * Runs every check over already-loaded inputs and returns one message per problem.
 * Pure, so the spec drives it without touching the file system.
 */
export function checkI18n({ catalogFiles, sources, allowlist = [], rollupText, localeDirs, languages }) {
  const problems = [];
  const { merged, problems: mergeProblems } = mergeCatalogs(catalogFiles);
  problems.push(...mergeProblems);

  const messages = flattenCatalog(merged);
  const catalogKeys = Object.keys(messages);
  const namespaces = new Set(Object.keys(merged));
  const scans = sources.map(({ file, text }) => scanSource(file, text));

  const used = new Set();
  const keyRefs = scans.flatMap((s) => s.keys);
  for (const ref of keyRefs) {
    const namespace = ref.key.split('.')[0];
    // `*Key` props also carry storage keys, ids and so on; only a value that names a
    // catalogue namespace is an i18n key. t() and i18nKey always are.
    const isI18nRef = ref.via === 't()' || ref.via === 'i18nKey' || namespaces.has(namespace);
    if (!isI18nRef) {
      continue;
    }
    if (ref.key in messages) {
      used.add(ref.key);
    } else {
      problems.push(`${ref.file}:${ref.line}: missing key "${ref.key}" (${ref.via})`);
    }
  }

  for (const ref of scans.flatMap((s) => s.defaultValues)) {
    if (namespaces.has(ref.key.split('.')[0])) {
      problems.push(`${ref.file}:${ref.line}: "${ref.key}" passes defaultValue, which hides a missing key; define it in the catalogue`);
    }
  }

  for (const ref of scans.flatMap((s) => s.prefixes)) {
    const matches = catalogKeys.filter((k) => k.startsWith(ref.prefix));
    if (matches.length === 0) {
      problems.push(`${ref.file}:${ref.line}: no key matches the template prefix "${ref.prefix}"`);
    }
    matches.forEach((k) => used.add(k));
  }

  const strings = new Set(scans.flatMap((s) => [...s.strings]));
  const heads = [...new Set(scans.flatMap((s) => [...s.heads]))].filter((h) => namespaces.has(h.split('.')[0]));
  const tails = new Set(scans.flatMap((s) => s.tails));
  const allowed = new Set(allowlist);
  for (const key of catalogKeys) {
    if (used.has(key) || strings.has(key) || allowed.has(key) || heads.some((h) => key.startsWith(h))) {
      continue;
    }
    const viaTail = [...tails].some((tail) => key.endsWith(tail) && strings.has(key.slice(0, -tail.length)));
    if (!viaTail) {
      problems.push(`orphan key "${key}" is never referenced (delete it, or list it in scripts/i18n-allowlist.json)`);
    }
  }
  for (const key of allowed) {
    if (!(key in messages)) {
      problems.push(`scripts/i18n-allowlist.json: "${key}" is not a catalogue key`);
    }
  }

  for (const [key, message] of Object.entries(messages)) {
    if (typeof message !== 'string') {
      problems.push(`"${key}" is not a string message`);
      continue;
    }
    try {
      // i18next-icu formats with ignoreTag, so <Trans> placeholders (<1>…</1>) are text, not ICU tags.
      new IntlMessageFormat(message, 'en', undefined, { ignoreTag: true });
    } catch (e) {
      problems.push(`"${key}" is not valid ICU: ${e.message}`);
    }
  }

  // Git may check the file out with CRLF line endings; the generator writes LF.
  if (rollupText !== undefined && rollupText.replace(/\r\n/g, '\n') !== serializeRollup(merged)) {
    problems.push('src/i18n-default.json is stale; run `npm run translate` and commit the result');
  }

  if (localeDirs && languages) {
    const dirs = new Set(localeDirs);
    const langs = new Set(languages);
    for (const lang of langs) {
      if (!dirs.has(lang)) {
        problems.push(`Language.${lang} has no public/locales/${lang}/ catalogue`);
      }
    }
    for (const dir of dirs) {
      if (!langs.has(dir)) {
        problems.push(`public/locales/${dir}/ has no Language enum value`);
      }
    }
  }

  return problems;
}

function walk(dir, test, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, test, out);
    } else if (test(full)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = path.join(root, 'src');
  const rel = (file) => path.relative(root, file).split(path.sep).join('/');

  const catalogFiles = walk(src, (f) => CATALOG_FILE.test(f))
    .map((file) => ({ file: rel(file), json: JSON.parse(fs.readFileSync(file, 'utf8')) }))
    .sort((a, b) => compareCatalogPaths(a.file, b.file));
  const sources = walk(src, (f) => SOURCE_EXTENSIONS.test(f) && !SKIPPED_SOURCES.test(f.split(path.sep).join('/')))
    .map((file) => ({ file: rel(file), text: fs.readFileSync(file, 'utf8') }));
  // `{ "<key>": "<why no source references it>" }`
  const allowlist = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n-allowlist.json'), 'utf8')));
  const rollupText = fs.readFileSync(path.join(src, 'i18n-default.json'), 'utf8');
  const localeDirs = fs.readdirSync(path.join(root, 'public/locales'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const languages = readLanguageEnum(fs.readFileSync(path.join(src, 'types/languages.ts'), 'utf8'));

  const problems = checkI18n({ catalogFiles, sources, allowlist, rollupText, localeDirs, languages });
  if (problems.length > 0) {
    console.error(`i18n:check found ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`i18n:check: ${catalogFiles.length} catalogues, ${sources.length} sources, all keys resolve`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
