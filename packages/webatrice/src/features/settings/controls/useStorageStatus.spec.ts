import { act, renderHook } from '@testing-library/react';

import { countStoredRecords, estimateStorage, isStoragePersisted, Stores } from '@app/services';

import { refreshStorageStatus, resetStorageStatus, useStorageStatus } from './useStorageStatus';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  estimateStorage: vi.fn(),
  countStoredRecords: vi.fn(),
  isStoragePersisted: vi.fn(),
}));

type Counts = Awaited<ReturnType<typeof countStoredRecords>>;

describe('useStorageStatus', () => {
  beforeEach(() => {
    resetStorageStatus();
    vi.mocked(estimateStorage).mockResolvedValue(null);
    vi.mocked(isStoragePersisted).mockResolvedValue(false);
  });

  test('a refresh after a clear is not answered by a read that started before it', async () => {
    let finishMountRead: (counts: Counts) => void = () => {};
    vi.mocked(countStoredRecords)
      .mockReturnValueOnce(new Promise((resolve) => {
        finishMountRead = resolve;
      }))
      .mockResolvedValueOnce({ [Stores.SCRYFALL_CACHE]: 0 } as Counts);

    const { result } = renderHook(() => useStorageStatus());
    await act(() => refreshStorageStatus());
    expect(result.current.counts[Stores.SCRYFALL_CACHE]).toBe(0);

    await act(async () => finishMountRead({ [Stores.SCRYFALL_CACHE]: 12 } as Counts));
    expect(result.current.counts[Stores.SCRYFALL_CACHE]).toBe(0);
  });
});
