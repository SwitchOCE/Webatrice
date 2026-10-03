// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { checkI18n, flattenCatalog, mergeCatalogs, readLanguageEnum, scanSource } from './check-i18n.mjs';

const catalog = (json) => [{ file: 'src/A.i18n.json', json }];

const run = (overrides) => checkI18n({
  catalogFiles: catalog({ A: { title: 'Title' } }),
  sources: [{ file: 'src/A.tsx', text: 't(\'A.title\');' }],
  ...overrides,
});

describe('flattenCatalog', () => {
  it('joins nested keys with dots', () => {
    expect(flattenCatalog({ A: { b: { c: 'x' }, d: 'y' } })).toEqual({ 'A.b.c': 'x', 'A.d': 'y' });
  });
});

describe('mergeCatalogs', () => {
  it('reports a namespace defined in two files', () => {
    const { problems } = mergeCatalogs([
      { file: 'one.i18n.json', json: { A: { x: '1' } } },
      { file: 'two.i18n.json', json: { A: { y: '2' } } },
    ]);
    expect(problems).toEqual(['two.i18n.json: namespace "A" is already defined in another *.i18n.json']);
  });
});

describe('scanSource', () => {
  it('collects t(), i18n.t(), i18nKey and *Key references', () => {
    const scan = scanSource('src/A.tsx', `
      t('A.one');
      i18n.t('A.two');
      const el = <Trans i18nKey="A.three" />;
      const entry = { labelKey: 'A.four' };
    `);
    expect(scan.keys.map((k) => [k.key, k.via])).toEqual([
      ['A.one', 't()'],
      ['A.two', 't()'],
      ['A.three', 'i18nKey'],
      ['A.four', 'labelKey'],
    ]);
  });

  it('records template prefixes, dynamic tails and defaultValue calls', () => {
    const scan = scanSource('src/A.ts', `
      t(\`A.column.\${c}\`);
      t(\`\${prefix}.count\`);
      t('A.title', { defaultValue: 'Title' });
    `);
    expect(scan.prefixes.map((p) => p.prefix)).toEqual(['A.column.']);
    expect(scan.tails).toEqual(['.count']);
    expect(scan.defaultValues.map((d) => d.key)).toEqual(['A.title']);
  });
});

describe('readLanguageEnum', () => {
  it('reads the string values of the Language enum', () => {
    expect(readLanguageEnum('export enum Language { \'en_US\' = \'en_US\', \'de\' = \'de\' }')).toEqual(['en_US', 'de']);
  });
});

describe('checkI18n', () => {
  it('passes a catalogue whose keys are all used and defined', () => {
    expect(run({})).toEqual([]);
  });

  it('reports a literal key the catalogue does not define', () => {
    const problems = run({ sources: [{ file: 'src/A.tsx', text: 't(\'A.title\'); t(\'A.missing\');' }] });
    expect(problems).toEqual(['src/A.tsx:1: missing key "A.missing" (t())']);
  });

  it('ignores *Key values outside the catalogue namespaces', () => {
    expect(run({ sources: [{ file: 'src/A.ts', text: 't(\'A.title\'); const s = { storageKey: \'webatrice.x\' };' }] })).toEqual([]);
  });

  it('rejects a defaultValue on a catalogue key', () => {
    const problems = run({ sources: [{ file: 'src/A.tsx', text: 't(\'A.title\', { defaultValue: \'Title\' });' }] });
    expect(problems).toEqual([
      'src/A.tsx:1: "A.title" passes defaultValue, which hides a missing key; define it in the catalogue',
    ]);
  });

  it('reports a template prefix with no keys under it', () => {
    const problems = run({ sources: [{ file: 'src/A.tsx', text: 't(\'A.title\'); t(`A.column.${c}`);' }] });
    expect(problems).toEqual(['src/A.tsx:1: no key matches the template prefix "A.column."']);
  });

  it('reports orphans, and counts keys reached by templates, string data, tails and the allowlist', () => {
    const catalogFiles = catalog({
      A: {
        column: { name: 'Name' },
        steps: { one: 'One' },
        label: 'Label',
        confirm: { count: '{n} items' },
        preflight: 'Shown before i18next loads',
        orphan: 'Nobody renders this',
      },
    });
    const text = [
      't(`A.column.${c}`);',
      'const steps = keys.map((k) => `A.steps.${k}`);',
      'const entry = { label: \'A.label\', prefix: \'A.confirm\' };',
      't(`${prefix}.count`);',
    ].join('\n');
    const problems = run({ catalogFiles, sources: [{ file: 'src/A.tsx', text }], allowlist: ['A.preflight'] });
    expect(problems).toEqual([
      'orphan key "A.orphan" is never referenced (delete it, or list it in scripts/i18n-allowlist.json)',
    ]);
  });

  it('reports an allowlisted key the catalogue no longer has', () => {
    expect(run({ allowlist: ['A.gone'] })).toEqual(['scripts/i18n-allowlist.json: "A.gone" is not a catalogue key']);
  });

  it('reports a message that is not valid ICU, ignoring <Trans> tags', () => {
    const catalogFiles = catalog({ A: { title: '<1>ok</1>', broken: '{count, plural, one {x}' } });
    const sources = [{ file: 'src/A.tsx', text: 't(\'A.title\'); t(\'A.broken\');' }];
    const problems = run({ catalogFiles, sources });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^"A.broken" is not valid ICU: /);
  });

  it('reports a stale rollup', () => {
    expect(run({ rollup: { A: { title: 'Old title' } } })).toEqual([
      'src/i18n-default.json is stale; run `npm run translate` and commit the result',
    ]);
    expect(run({ rollup: { A: { title: 'Title' } } })).toEqual([]);
  });

  it('reports locale folders and Language values that do not match', () => {
    expect(run({ localeDirs: ['en_US', 'xx'], languages: ['en_US', 'de'] })).toEqual([
      'Language.de has no public/locales/de/ catalogue',
      'public/locales/xx/ has no Language enum value',
    ]);
  });
});
