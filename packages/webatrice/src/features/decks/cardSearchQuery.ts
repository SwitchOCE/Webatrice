import type { ManaColor } from './manaSymbols';

/**
 * Advanced card search: filter state and the Scryfall query it composes
 * to. Ports fancy webatrice's `buildScryfallQuery` verbatim so both apps
 * understand the same query scheme.
 */

export type FilterColorMode = 'includes' | 'exactly' | 'atMost';
export type FilterCardType =
  | 'Creature'
  | 'Instant'
  | 'Sorcery'
  | 'Enchantment'
  | 'Artifact'
  | 'Planeswalker'
  | 'Land';
export type FilterRarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export interface SearchFiltersState {
  colors: ManaColor[];
  colorMode: FilterColorMode;
  types: FilterCardType[];
  subtype: string;
  showAdvanced: boolean;
  cmcMin: string;
  cmcMax: string;
  oracle: string;
  rarities: FilterRarity[];
}

export const EMPTY_FILTERS: SearchFiltersState = {
  colors: [],
  colorMode: 'includes',
  types: [],
  subtype: '',
  showAdvanced: false,
  cmcMin: '',
  cmcMax: '',
  oracle: '',
  rarities: [],
};

export const FILTER_TYPES: FilterCardType[] = [
  'Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land',
];

export const FILTER_RARITIES: Array<{ id: FilterRarity; label: string }> = [
  { id: 'common', label: 'C' },
  { id: 'uncommon', label: 'U' },
  { id: 'rare', label: 'R' },
  { id: 'mythic', label: 'M' },
];

/**
 * Combine the typed query with the filter state into one Scryfall query.
 * Filters AND-combine with the typed text (Scryfall AND is implicit).
 */
export function buildScryfallQuery(typed: string, f: SearchFiltersState): string {
  const parts: string[] = [];
  const text = typed.trim();
  if (text) {
    parts.push(text);
  }

  if (f.colors.length > 0) {
    const letters = f.colors.map((c) => c.toLowerCase()).join('');
    const op = f.colorMode === 'exactly' ? '=' : f.colorMode === 'atMost' ? '<=' : ':';
    parts.push(`c${op}${letters}`);
  }

  if (f.types.length > 0) {
    const clauses = f.types.map((t) => `t:${t.toLowerCase()}`);
    parts.push(clauses.length > 1 ? `(${clauses.join(' or ')})` : clauses[0]);
  }

  // Subtype: quoted phrase → single clause; otherwise per-token AND.
  const subtype = f.subtype.trim();
  if (subtype) {
    const hasQuotes = /^".*"$/.test(subtype);
    if (hasQuotes) {
      parts.push(`t:${subtype.toLowerCase()}`);
    } else {
      const tokens = subtype.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        parts.push(`t:${tok.toLowerCase()}`);
      }
    }
  }

  const min = f.cmcMin.trim();
  const max = f.cmcMax.trim();
  if (min && /^\d+$/.test(min)) {
    parts.push(`cmc>=${min}`);
  }
  if (max && /^\d+$/.test(max)) {
    parts.push(`cmc<=${max}`);
  }

  const oracle = f.oracle.trim();
  if (oracle) {
    const safe = oracle.replace(/"/g, '\\"');
    parts.push(`o:"${safe}"`);
  }

  // Full selection == no filter; only emit when partially narrowed.
  if (f.rarities.length > 0 && f.rarities.length < 4) {
    const clauses = f.rarities.map((r) => `r:${r}`);
    parts.push(clauses.length > 1 ? `(${clauses.join(' or ')})` : clauses[0]);
  }

  return parts.join(' ');
}

/** True when any filter (not the advanced-panel toggle) narrows the search. */
export function hasActiveFilters(f: SearchFiltersState): boolean {
  return (
    f.colors.length > 0 ||
    f.types.length > 0 ||
    f.subtype.trim() !== '' ||
    f.cmcMin.trim() !== '' ||
    f.cmcMax.trim() !== '' ||
    f.oracle.trim() !== '' ||
    f.rarities.length > 0
  );
}

/** Add `item` when absent, remove it when present. */
export function toggleFilter<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}
