import type { Mock } from 'vitest';

import { dexieService } from '../../dexie';
import { bulkGetFromScryfallCache, bulkPutScryfallCache, getFromScryfallCache, putScryfallCache } from './scryfallCache';
import type { LookupResult } from './types';

vi.mock('../../dexie', () => ({
  dexieService: { scryfallCache: { get: vi.fn(), bulkGet: vi.fn(), put: vi.fn(), bulkPut: vi.fn() } },
}));

const cache = dexieService.scryfallCache as unknown as { get: Mock; bulkGet: Mock; put: Mock; bulkPut: Mock };

const WITH_COMBO: LookupResult = {
  found: true,
  source: 'scryfall',
  name: 'Command Tower',
  printings: [],
  related: [{ name: 'Tower Winder', component: 'combo_piece', origin: 'scryfall' }],
};

describe('scryfallCache', () => {
  it('drops stale combo pieces on read', async () => {
    cache.get.mockResolvedValue(WITH_COMBO);
    cache.bulkGet.mockResolvedValue([WITH_COMBO, undefined]);

    await expect(getFromScryfallCache('Command Tower')).resolves.toEqual({ ...WITH_COMBO, related: undefined });
    await expect(bulkGetFromScryfallCache(['Command Tower', 'Missing'])).resolves.toEqual([
      { ...WITH_COMBO, related: undefined },
      undefined,
    ]);
  });

  it('reads a failing table as misses', async () => {
    cache.get.mockRejectedValue(new Error('blocked'));
    cache.bulkGet.mockRejectedValue(new Error('blocked'));

    await expect(getFromScryfallCache('Opt')).resolves.toBeUndefined();
    await expect(bulkGetFromScryfallCache(['Opt', 'Ponder'])).resolves.toEqual([undefined, undefined]);
  });

  it('swallows write failures and skips an empty bulk write', async () => {
    cache.put.mockRejectedValue(new Error('quota'));
    cache.bulkPut.mockRejectedValue(new Error('quota'));

    await expect(putScryfallCache(WITH_COMBO)).resolves.toBeUndefined();
    await expect(bulkPutScryfallCache([WITH_COMBO])).resolves.toBeUndefined();
    cache.bulkPut.mockClear();
    await bulkPutScryfallCache([]);
    expect(cache.bulkPut).not.toHaveBeenCalled();
  });
});
