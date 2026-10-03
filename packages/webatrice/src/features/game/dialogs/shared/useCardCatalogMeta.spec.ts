import { act, renderHook } from '@testing-library/react';

import { lookupCardsCached } from '../../../../services/cards/catalog/lookup';
import { useCardCatalogMeta } from './useCardCatalogMeta';

vi.mock('../../../../services/cards/catalog/lookup', () => ({
  lookupCardsCached: vi.fn(),
}));

type LookupResult = Awaited<ReturnType<typeof lookupCardsCached>> extends Map<string, infer R> ? R : never;

const BEARS = {
  found: true,
  source: 'scryfall',
  name: 'Grizzly Bears',
  typeLine: 'Creature — Bear',
  cmc: 2,
  colors: ['G'],
  power: '2',
  toughness: '2',
  printings: [{ set: 'm10' }],
} as unknown as LookupResult;

beforeEach(() => {
  vi.mocked(lookupCardsCached).mockImplementation(async (names: string[]) =>
    new Map(names.filter((n) => n === 'Grizzly Bears').map((n) => [n, BEARS])));
});

const flush = () => act(async () => undefined);

describe('useCardCatalogMeta', () => {
  it('maps the catalog fields by name once every name is answered', async () => {
    const { result } = renderHook(() => useCardCatalogMeta([{ name: 'Grizzly Bears' }, { name: 'Grizzly Bears' }, { name: '' }]));
    expect(result.current.metadataLoaded).toBe(false);
    await flush();
    expect(result.current.metadataLoaded).toBe(true);
    expect(result.current.metaByName.get('Grizzly Bears')).toEqual({
      name: 'Grizzly Bears',
      type_line: 'Creature — Bear',
      cmc: 2,
      colors: ['G'],
      set: 'm10',
      power: '2',
      toughness: '2',
    });
    expect(lookupCardsCached).toHaveBeenCalledWith(['Grizzly Bears']);
  });

  it('counts a name the catalog leaves out as unknown, and asks only for new names', async () => {
    const { result, rerender } = renderHook(({ cards }) => useCardCatalogMeta(cards), {
      initialProps: { cards: [{ name: 'Grizzly Bears' }, { name: 'Mystery' }] },
    });
    await flush();
    expect(result.current.metadataLoaded).toBe(true);
    expect(result.current.metaByName.get('Mystery')).toMatchObject({ type_line: null, cmc: null });
    expect(lookupCardsCached).toHaveBeenCalledTimes(1);

    rerender({ cards: [{ name: 'Grizzly Bears' }, { name: 'Opt' }] });
    expect(result.current.metadataLoaded).toBe(false);
    await flush();
    expect(lookupCardsCached).toHaveBeenCalledTimes(2);
    expect(lookupCardsCached).toHaveBeenLastCalledWith(['Opt']);
    expect(result.current.metadataLoaded).toBe(true);
  });

  it('is loaded at once with no names to look up', () => {
    const { result } = renderHook(() => useCardCatalogMeta([]));
    expect(result.current.metadataLoaded).toBe(true);
    expect(lookupCardsCached).not.toHaveBeenCalled();
  });
});
