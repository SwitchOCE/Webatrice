import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCardData,
  clearScryfallCache,
  countStoredRecords,
  dexieService,
  HostDTO,
  SettingDTO,
  Stores,
} from '@app/services';
import { APP_USER } from '@app/types';
import { resetDexie } from './resetDexie';

async function seed(): Promise<void> {
  await dexieService.cards.put({ name: { value: 'Island' } });
  await dexieService.sets.put({ name: { value: 'LEA' } });
  await dexieService.tokens.put({ name: { value: 'Soldier' } });
  await dexieService.formats.put({ formatName: 'modern' });
  await dexieService.info.put({ id: 'singleton', source: 'oracle-local-fs', importedAt: '2026-01-01' });
  await dexieService.scryfallCache.put({ name: 'Island' });
  await new SettingDTO(APP_USER).save();
  await HostDTO.add({ name: 'Local', host: 'localhost', port: '4748', editable: true });
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDexie();
  await dexieService.clear([Stores.CARDS, Stores.SETS, Stores.TOKENS, Stores.FORMATS, Stores.INFO, Stores.SCRYFALL_CACHE]);
  await seed();
});

describe('Storage clears (real Dexie)', () => {
  it('counts the rows of every table', async () => {
    const counts = await countStoredRecords();

    expect(counts).toEqual({
      [Stores.CARDS]: 1,
      [Stores.SETS]: 1,
      [Stores.TOKENS]: 1,
      [Stores.FORMATS]: 1,
      [Stores.INFO]: 1,
      [Stores.SCRYFALL_CACHE]: 1,
      [Stores.HOSTS]: 1,
      [Stores.SETTINGS]: 1,
    });
  });

  it('clearing the Scryfall cache leaves the imported card database', async () => {
    await clearScryfallCache();

    const counts = await countStoredRecords();
    expect(counts[Stores.SCRYFALL_CACHE]).toBe(0);
    expect(counts[Stores.CARDS]).toBe(1);
  });

  it('clearing card data keeps settings, known hosts and the Scryfall cache', async () => {
    await clearCardData();

    const counts = await countStoredRecords();
    expect([counts[Stores.CARDS], counts[Stores.SETS], counts[Stores.TOKENS], counts[Stores.FORMATS], counts[Stores.INFO]])
      .toEqual([0, 0, 0, 0, 0]);
    expect(counts[Stores.SETTINGS]).toBe(1);
    expect(counts[Stores.HOSTS]).toBe(1);
    expect(counts[Stores.SCRYFALL_CACHE]).toBe(1);
  });
});
