// A card catalog that knows no card, for seat specs: every lookup resolves as
// "unknown" (the render fallback), so nothing reaches Dexie or Scryfall. Use as
//   vi.mock('<path>/services/cards/cardCatalog', async () =>
//     (await import('<path>/__test-utils__/unknownCardCatalog')).unknownCardCatalog());

const unknown = (name: string) => ({ found: false, source: 'unknown' as const, name, printings: [] });

export function unknownCardCatalog() {
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
}
