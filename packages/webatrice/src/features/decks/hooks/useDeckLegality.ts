import { useEffect, useMemo, useState } from 'react';

import { getFormatRules, lookupCardsCached } from '@app/services';

import { deckLegality, legalityFacts, toFormatRules, type DeckLegality, type FormatRules, type LegalityFacts } from '../deckLegality';
import type { HydratedDeck } from '../types';

export interface UseDeckLegality extends DeckLegality {
  /** True until the card data and format rules for the current deck are in. */
  loading: boolean;
}

const EMPTY_FACTS: ReadonlyMap<string, LegalityFacts | undefined> = new Map();

/**
 * Legality of the open deck for its format (desktop recomputes on every
 * card or format change). Card data comes from the session-cached card
 * lookups, format rules from the imported card database; the verdict itself
 * is the pure `deckLegality`.
 */
export function useDeckLegality(deck: HydratedDeck | null): UseDeckLegality {
  const format = deck?.format ?? '';
  // Only the set of names needs a lookup; quantity edits re-run the pure check.
  const namesKey = useMemo(
    () => Array.from(new Set((deck?.cards ?? []).map((c) => c.name))).sort().join('\n'),
    [deck?.cards],
  );

  const [facts, setFacts] = useState<{ key: string; byName: ReadonlyMap<string, LegalityFacts | undefined> }>();
  const [rules, setRules] = useState<{ format: string; rules: FormatRules | undefined }>();

  useEffect(() => {
    if (!namesKey) {
      setFacts({ key: namesKey, byName: EMPTY_FACTS });
      return;
    }
    let cancelled = false;
    lookupCardsCached(namesKey.split('\n'))
      .then((lookups) => {
        if (!cancelled) {
          const byName = new Map<string, LegalityFacts | undefined>();
          for (const [name, lookup] of lookups) {
            byName.set(name, legalityFacts(lookup));
          }
          setFacts({ key: namesKey, byName });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFacts({ key: namesKey, byName: EMPTY_FACTS });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [namesKey]);

  useEffect(() => {
    let cancelled = false;
    getFormatRules(format)
      .then((found) => {
        if (!cancelled) {
          setRules({ format, rules: toFormatRules(found) });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRules({ format, rules: undefined });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [format]);

  const loading = facts?.key !== namesKey || rules?.format !== format;
  const result = useMemo(
    // While data for a new card set or format is on its way, nothing is
    // flagged rather than flashing stale verdicts.
    () => deckLegality(deck?.cards ?? [], loading ? '' : format, facts?.byName ?? EMPTY_FACTS, rules?.rules),
    [deck?.cards, format, facts, rules, loading],
  );
  return { ...result, loading };
}
