import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PREFERENCE_DEFAULTS, SETTINGS_VERSION, ThemeMode } from '@app/types';
import { schemaV1 } from '../../../../src/services/dexie/DexieSchemas/v1.schema';
import { schemaV2, Stores } from '../../../../src/services/dexie/DexieSchemas/v2.schema';
import { schemaV6 } from '../../../../src/services/dexie/DexieSchemas/v6.schema';

// A private database per test, opened first at the pre-settings-page schema (v4) and then again
// with the v6 upgrade, so the real Dexie upgrade path runs against fake-indexeddb.
let dbName: string;

const openAt = async (latest: 4 | 6) => {
  const db = new Dexie(dbName);
  schemaV1(db);
  schemaV2(db);
  if (latest === 6) {
    schemaV6(db);
  }
  await db.open();
  return db;
};

beforeEach(() => {
  vi.useRealTimers();
  dbName = `settings-migration-${Math.random().toString(36).slice(2)}`;
});

afterEach(async () => {
  await Dexie.delete(dbName);
});

describe('settings schema v6 upgrade (real Dexie)', () => {
  it('keeps a v4 row\'s values and shortcut overrides and backfills every new preference', async () => {
    const v4 = await openAt(4);
    await v4.table(Stores.SETTINGS).put({
      user: '*app',
      autoConnect: true,
      invertVerticalCoordinate: true,
      shortcuts: { 'game.drawCard': ['Ctrl+KeyD'] },
    });
    v4.close();

    const v6 = await openAt(6);
    const row = await v6.table(Stores.SETTINGS).get('*app');
    v6.close();

    expect(row).toMatchObject({
      ...PREFERENCE_DEFAULTS,
      user: '*app',
      version: SETTINGS_VERSION,
      autoConnect: true,
      invertVerticalCoordinate: true,
      shortcuts: { 'game.drawCard': ['Ctrl+KeyD'] },
      // Settings v2: an existing user keeps the dark palette they have always had.
      themeMode: ThemeMode.Dark,
    });
  });

  it('leaves other tables alone', async () => {
    const v4 = await openAt(4);
    await v4.table(Stores.HOSTS).add({ name: 'Rooster', host: 'server.cockatrice.us', port: '4748' });
    v4.close();

    const v6 = await openAt(6);
    expect(await v6.table(Stores.HOSTS).count()).toBe(1);
    v6.close();
  });

  it('opens an empty database straight at v6', async () => {
    const v6 = await openAt(6);
    expect(v6.verno).toBe(6);
    expect(await v6.table(Stores.SETTINGS).count()).toBe(0);
    v6.close();
  });
});
