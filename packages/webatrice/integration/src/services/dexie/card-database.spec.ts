import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';

import { cardDatabaseService } from '../../../../src/feature-widgets/card-import/CardDatabaseService';
import { currentCardDataPreferences } from '@app/hooks';
import { dexieService } from '@app/services';
import { schemaV1 } from '../../../../src/services/dexie/DexieSchemas/v1.schema';
import { schemaV2 } from '../../../../src/services/dexie/DexieSchemas/v2.schema';
import { schemaV6 } from '../../../../src/services/dexie/DexieSchemas/v6.schema';
import { schemaV7 } from '../../../../src/services/dexie/DexieSchemas/v7.schema';

const cardsXml = `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_carddatabase version="4">
  <info><author>Oracle</author><sourceVersion>5.2.1</sourceVersion></info>
  <sets>
    <set><name>LEA</name><longname>Alpha</longname><releasedate>1993-08-05</releasedate></set>
    <set><name>M10</name><longname>Magic 2010</longname><releasedate>2009-07-17</releasedate></set>
  </sets>
  <cards>
    <card><name>Lightning Bolt</name><text>main</text><set uuid="a">LEA</set><set uuid="b">M10</set></card>
  </cards>
</cockatrice_carddatabase>`;

const spoilerXml = `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_carddatabase version="4">
  <sets><set><name>NEW</name><longname>Upcoming</longname><releasedate>2027-01-01</releasedate></set></sets>
  <cards>
    <card><name>Lightning Bolt</name><text>spoiler</text><set uuid="c">NEW</set></card>
    <card><name>Fresh Card</name><set uuid="d">NEW</set></card>
  </cards>
</cockatrice_carddatabase>`;

const customXml = `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_carddatabase version="4">
  <sets><set><name>CUS</name></set></sets>
  <cards><card><name>Homebrew</name><set>CUS</set></card></cards>
</cockatrice_carddatabase>`;

async function cardNamed(name: string) {
  return dexieService.cards.get(name);
}

beforeEach(async () => {
  vi.useRealTimers();
  await Promise.all([
    dexieService.cards.clear(),
    dexieService.sets.clear(),
    dexieService.tokens.clear(),
    dexieService.formats.clear(),
    dexieService.info.clear(),
    dexieService.cardSources.clear(),
    dexieService.setPreferences.clear(),
    dexieService.cardDataSettings.clear(),
  ]);
});

describe('card database sources (real Dexie)', () => {
  it('first import enables every set and records provenance', async () => {
    const result = await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);

    expect(result.allNewSetsEnabled).toBe(true);
    expect(result.summary).toEqual({ cards: 1, sets: 2, tokens: 0, formats: 0 });
    expect(await dexieService.setPreferences.toCollection().sortBy('sortKey')).toEqual([
      { code: 'M10', sortKey: 0, enabled: true, isKnown: true },
      { code: 'LEA', sortKey: 1, enabled: true, isKnown: true },
    ]);
    const [main] = await cardDatabaseService.listSources();
    expect(main).toMatchObject({ id: 'main', kind: 'main', fileName: 'cards.xml', sourceVersion: '5.2.1' });
    expect(main.xml).toBeUndefined();
    expect((await dexieService.info.get('singleton'))?.source).toBe('oracle-local-fs');
  });

  it('merges later sources like desktop and asks about new sets', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);
    const result = await cardDatabaseService.addSources([{ fileName: 'spoiler.xml', xml: spoilerXml, origin: 'file' }]);

    expect(result.unknownSets).toEqual(['NEW']);
    const bolt = await cardNamed('Lightning Bolt');
    expect(bolt.text.value).toBe('main');
    expect(bolt.set.map((s: { value: string }) => s.value)).toEqual(['LEA', 'M10', 'NEW']);
    expect(await cardNamed('Fresh Card')).toBeDefined();

    await cardDatabaseService.resolveUnknownSets('enable');
    expect(await dexieService.setPreferences.get('NEW')).toMatchObject({ enabled: true, isKnown: true });
  });

  it('removes a custom set and its cards on rebuild', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);
    await cardDatabaseService.addSources([{ fileName: 'cube.xml', xml: customXml, origin: 'file' }]);
    expect(await cardNamed('Homebrew')).toBeDefined();

    const custom = (await cardDatabaseService.listSources()).find((s) => s.kind === 'custom')!;
    expect(custom.id).toBe('custom:01:cube.xml');
    await cardDatabaseService.removeSource(custom.id);

    expect(await cardNamed('Homebrew')).toBeUndefined();
    expect(await cardNamed('Lightning Bolt')).toBeDefined();
  });

  it('keeps the previous database when a file is malformed', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);

    await expect(
      cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: '<not closed', origin: 'file' }]),
    ).rejects.toThrow('Cockatrice XML is malformed');

    expect(await cardNamed('Lightning Bolt')).toBeDefined();
    expect(await dexieService.cardSources.count()).toBe(1);
  });

  it('reload re-derives the tables from the stored sources', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);
    await dexieService.cards.clear();

    const result = await cardDatabaseService.reload();
    expect(result.summary.cards).toBe(1);
    expect(await cardNamed('Lightning Bolt')).toBeDefined();
  });

  it('saves set priority and refreshes the shared preferences', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);
    await cardDatabaseService.saveSetPreferences([
      { code: 'LEA', sortKey: 1, enabled: true, isKnown: true },
      { code: 'M10', sortKey: 2, enabled: false, isKnown: true },
    ]);

    const preferences = await currentCardDataPreferences();
    expect(preferences.setPreferences.get('M10')?.enabled).toBe(false);
    expect(preferences.setLongNames.get('LEA')).toBe('Alpha');
  });

  it('stores editor tokens as their own source that survives a reload', async () => {
    await cardDatabaseService.addSources([{ fileName: 'cards.xml', xml: cardsXml, origin: 'file' }]);
    const token = { name: { value: 'Spirit' }, set: { value: 'TK' }, token: { value: '1' } };
    await cardDatabaseService.saveCustomTokens([token]);

    expect(await cardDatabaseService.isNameTaken('spirit')).toBe(true);
    expect(await cardDatabaseService.isNameTaken('lightning bolt')).toBe(true);
    await cardDatabaseService.reload();
    expect(await dexieService.tokens.get('Spirit')).toBeDefined();
    expect(await dexieService.sets.get('TK')).toBeDefined();

    await cardDatabaseService.saveCustomTokens([], ['Spirit']);
    expect(await dexieService.tokens.get('Spirit')).toBeUndefined();
  });
});

// Opens a private database at `version` with exactly the schema steps up to it, the way an
// install that last ran that release would hold it.
const STEPS: Array<[number, (db: Dexie) => void]> = [[4, schemaV2], [6, schemaV6], [7, schemaV7]];

function openAt(name: string, version: number): Promise<Dexie> {
  const db = new Dexie(name);
  schemaV1(db);
  STEPS.filter(([at]) => at <= version).forEach(([, step]) => step(db));
  return db.open();
}

async function seedCardData(db: Dexie) {
  await db.table('sets').bulkPut([
    { name: { value: 'LEA' }, longname: { value: 'Alpha' }, releasedate: { value: '1993-08-05' } },
    { name: { value: 'NEO' }, longname: { value: 'Neon' }, releasedate: { value: '2022-02-18' } },
  ]);
  await db.table('cards').put({ name: { value: 'Counterspell' }, set: { value: 'LEA' } });
}

async function expectMigratedCardData(db: Dexie) {
  expect(db.verno).toBe(7);
  expect(await db.table('setPreferences').toCollection().sortBy('sortKey')).toEqual([
    { code: 'NEO', sortKey: 0, enabled: true, isKnown: true },
    { code: 'LEA', sortKey: 1, enabled: true, isKnown: true },
  ]);
  const legacy = await db.table('cardSources').get('legacy');
  expect(legacy).toMatchObject({ kind: 'legacy', origin: 'migration', counts: { cards: 1, sets: 2, tokens: 0, formats: 0 } });
  expect(legacy.records.cards[0].name.value).toBe('Counterspell');
  // Earlier tables are untouched by the upgrade.
  expect(await db.table('cards').count()).toBe(1);
}

describe('Dexie v7 migration (real IndexedDB)', () => {
  it('upgrades a v6 install, keeping its cards through the next rebuild and its settings row', async () => {
    const name = `migration-v6-${Date.now()}`;
    const v6 = await openAt(name, 6);
    await seedCardData(v6);
    await v6.table('settings').put({ user: '*app', autoConnect: true, shortcuts: { 'game.drawCard': ['Ctrl+KeyD'] } });
    const settings = await v6.table('settings').toArray();
    v6.close();

    const v7 = await openAt(name, 7);
    await expectMigratedCardData(v7);
    expect(await v7.table('settings').toArray()).toEqual(settings);
    v7.close();
    await Dexie.delete(name);
  });

  it('upgrades a v4 install straight to v7 through the settings step', async () => {
    const name = `migration-v4-${Date.now()}`;
    const v4 = await openAt(name, 4);
    await seedCardData(v4);
    v4.close();

    const v7 = await openAt(name, 7);
    await expectMigratedCardData(v7);
    v7.close();
    await Dexie.delete(name);
  });

  it('opens an empty database straight at v7 with no legacy source', async () => {
    const name = `migration-fresh-${Date.now()}`;
    const v7 = await openAt(name, 7);
    expect(v7.verno).toBe(7);
    expect(await v7.table('cardSources').count()).toBe(0);
    expect(await v7.table('setPreferences').count()).toBe(0);
    v7.close();
    await Dexie.delete(name);
  });
});
