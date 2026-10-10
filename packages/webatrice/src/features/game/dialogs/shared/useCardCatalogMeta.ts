import { useEffect, useMemo, useState } from 'react';

import { lookupCardsCached, type LookupResult } from '@app/services';

import { placeholderMeta, type ZoneViewCardMetadata } from './zoneViewSort';

export function zoneViewMetaFromLookup(name: string, r: LookupResult): ZoneViewCardMetadata {
  return {
    name,
    type_line: r.typeLine ?? null,
    cmc: r.cmc ?? null,
    colors: r.colors ?? [],
    set: r.printings[0]?.set ?? null,
    power: r.power ?? null,
    toughness: r.toughness ?? null,
  };
}

export function useCardCatalogMeta(cards: readonly { name: string }[]) {
  const [metaByName, setMetaByName] = useState<ReadonlyMap<string, ZoneViewCardMetadata>>(() => new Map());
  const names = useMemo(() => [...new Set(cards.map((c) => c.name).filter((n) => n.length > 0))], [cards]);

  useEffect(() => {
    const needed = names.filter((name) => !metaByName.has(name));
    if (needed.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await lookupCardsCached(needed);
      if (cancelled) {
        return;
      }
      setMetaByName((prev) => {
        const next = new Map(prev);
        for (const name of needed) {
          const r = results.get(name);
          next.set(name, r ? zoneViewMetaFromLookup(name, r) : placeholderMeta(name));
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [names, metaByName]);

  const metadataLoaded = names.every((name) => metaByName.has(name));
  return { metaByName, metadataLoaded };
}
