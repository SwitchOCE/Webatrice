/**
 * Filter, sort and group policy for zone views, matching desktop's
 * ZoneViewWidget controls (view_zone_widget.cpp:234-250) so every zone
 * viewer offers the same sort keys and grouping buckets.
 *
 * Works on `ZoneViewCardMetadata`, the card-catalog fields a view needs,
 * rather than any deck-feature type. A card with unknown metadata (null
 * type line, mana value, set, P/T) still sorts and groups: it lands in
 * "Other", mana value 0 and the trailing P/T bucket.
 */

/** The card fields zone views filter, sort and group on. */
export interface ZoneViewCardMetadata {
  name: string;
  type_line: string | null;
  cmc: number | null;
  colors: readonly string[];
  set: string | null;
  power: string | null;
  toughness: string | null;
}

type HandCard = { id: string; name: string; scryfallId: string };

/** Grouping options match Cockatrice's ZoneViewWidget (view_zone_widget.cpp:234-237):
 *  Ungrouped, By Type, By Mana Value, By Color. */
export type GroupMode = 'none' | 'type' | 'cmc' | 'color';

/** Sort options match Cockatrice's ZoneViewWidget (view_zone_widget.cpp:244-250):
 *  Unsorted, By Name, By Type, By Mana Cost, By Color, By P/T, By Set. */
export type SortMode = 'none' | 'name' | 'cmc' | 'type' | 'color' | 'set' | 'pt';

export interface EnrichedCard<M extends ZoneViewCardMetadata = ZoneViewCardMetadata> {
  handCard: HandCard;
  meta: M;
}

export interface CardGroup<M extends ZoneViewCardMetadata = ZoneViewCardMetadata> {
  key: string;
  label: string;
  cards: EnrichedCard<M>[];
}

/** "Group by type" buckets, in display order. */
const TYPE_ORDER = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Other',
] as const;

type CardTypeGroup = (typeof TYPE_ORDER)[number];

/** Reduce a type line to its primary bucket. */
function primaryType(typeLine: string | null): CardTypeGroup {
  if (!typeLine) {
    return 'Other';
  }
  const front = typeLine.split('—')[0];
  for (const t of TYPE_ORDER) {
    if (front.includes(t)) {
      return t;
    }
  }
  return 'Other';
}

const COLOR_KEY_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
const COLOR_ALIASES: Record<string, string> = {
  w: 'W',
  u: 'U',
  b: 'B',
  r: 'R',
  g: 'G',
  c: 'C',
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
};

/** Filter a card by a search query supporting bare-token (name substring)
 *  and prefixed key:value expressions (t:type, c:color, cmc:N, set:XXX). */
export function matchesQuery(card: ZoneViewCardMetadata, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }
  const tokens = trimmed.toLowerCase().split(/\s+/);
  for (const t of tokens) {
    if (!t.includes(':')) {
      if (!card.name.toLowerCase().includes(t)) {
        return false;
      }
      continue;
    }
    const [rawKey, ...rest] = t.split(':');
    const key = rawKey;
    const val = rest.join(':');
    if (!val) {
      continue;
    }
    if (key === 't' || key === 'type') {
      if (!(card.type_line ?? '').toLowerCase().includes(val)) {
        return false;
      }
    } else if (key === 'c' || key === 'color') {
      const chars = val.length > 1 && !(val in COLOR_ALIASES)
        ? val.split('')
        : [val];
      const required = chars
        .map((ch) => COLOR_ALIASES[ch])
        .filter((c): c is string => Boolean(c));
      if (required.length === 0) {
        return false;
      }
      for (const r of required) {
        if (!card.colors.includes(r)) {
          return false;
        }
      }
    } else if (key === 'cmc' || key === 'mv' || key === 'manavalue') {
      const parsed = parseFloat(val);
      if (Number.isNaN(parsed) || (card.cmc ?? 0) !== parsed) {
        return false;
      }
    } else if (key === 'set' || key === 's') {
      if ((card.set ?? '').toLowerCase() !== val) {
        return false;
      }
    } else if (key === 'name' || key === 'n') {
      if (!card.name.toLowerCase().includes(val)) {
        return false;
      }
    } else {
      if (!card.name.toLowerCase().includes(t)) {
        return false;
      }
    }
  }
  return true;
}

/** Sort key for a Scryfall power/toughness string. Variable stats like
 *  "*" and "1+*" get sorted after fixed numeric values; non-creatures
 *  (null) sort last so P/T sort surfaces creatures at the top.
 *
 *  Deliberate divergence: desktop (card_list.cpp:42-62) compares the P/T
 *  string zero-padded to ten characters, which puts non-creatures first
 *  and "2/10" after "3/3". Numeric order is what that string sort
 *  approximates; the name tie-break below matches desktop. */
function ptSortKey(v: string | null): number {
  if (v == null) {
    return Number.POSITIVE_INFINITY;
  }
  const n = parseFloat(v);
  if (!Number.isNaN(n)) {
    return n;
  }
  return 1e6; // variable/non-numeric groups after real numbers
}

/** `Infinity - Infinity` is NaN, which a comparator must never return:
 *  two non-creatures would compare neither equal nor ordered and skip
 *  the name tie-break. */
function comparePtKeys(a: number, b: number): number {
  return a === b ? 0 : a - b;
}

export function compareCards(a: ZoneViewCardMetadata, b: ZoneViewCardMetadata, mode: SortMode): number {
  switch (mode) {
    case 'none':
      // Preserve caller order — matches Cockatrice's NoSort.
      return 0;
    case 'name':
      return a.name.localeCompare(b.name);
    case 'cmc':
      return (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name);
    case 'type':
      return (a.type_line ?? '').localeCompare(b.type_line ?? '') ||
        a.name.localeCompare(b.name);
    case 'color': {
      const ak = a.colors.join('');
      const bk = b.colors.join('');
      return ak.localeCompare(bk) || a.name.localeCompare(b.name);
    }
    case 'set':
      return (a.set ?? '').localeCompare(b.set ?? '') ||
        a.name.localeCompare(b.name);
    case 'pt':
      return comparePtKeys(ptSortKey(a.power), ptSortKey(b.power)) ||
        comparePtKeys(ptSortKey(a.toughness), ptSortKey(b.toughness)) ||
        a.name.localeCompare(b.name) ||
        (a.set ?? '').localeCompare(b.set ?? '');
    default:
      return 0;
  }
}

export function groupCards<M extends ZoneViewCardMetadata>(cards: EnrichedCard<M>[], mode: GroupMode): CardGroup<M>[] {
  if (mode === 'none') {
    return cards.length === 0 ? [] : [{ key: 'all', label: '', cards }];
  }

  const buckets = new Map<string, EnrichedCard<M>[]>();
  const push = (key: string, c: EnrichedCard<M>) => {
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  };

  if (mode === 'type') {
    for (const c of cards) {
      push(primaryType(c.meta.type_line), c);
    }
    return TYPE_ORDER.filter((t) => buckets.has(t)).map((t) => ({
      key: t,
      label: t,
      cards: buckets.get(t)!,
    }));
  }
  if (mode === 'cmc') {
    for (const c of cards) {
      push(String(c.meta.cmc ?? 0), c);
    }
    return [...buckets.keys()]
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({
        key: String(n),
        label: `Mana ${n}`,
        cards: buckets.get(String(n))!,
      }));
  }
  // color
  for (const c of cards) {
    const cols = c.meta.colors;
    const key = cols.length === 0 ? 'Colorless' : cols.slice().sort().join('');
    push(key, c);
  }
  return [...buckets.keys()]
    .sort((a, b) => {
      if (a === 'Colorless') {
        return 1;
      }
      if (b === 'Colorless') {
        return -1;
      }
      const rank = (k: string) =>
        k.length === 1 ? COLOR_KEY_ORDER.indexOf(k as never) : 10 + k.length;
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .map((k) => ({
      key: k,
      label: k === 'Colorless' ? 'Colorless' : k,
      cards: buckets.get(k)!,
    }));
}

/** Metadata for a name the catalog hasn't answered for (yet): sorts and
 *  groups as unknown ("Other", mana value 0). */
export function placeholderMeta(name: string): ZoneViewCardMetadata {
  return { name, type_line: null, cmc: null, colors: [], set: null, power: null, toughness: null };
}

export interface CardGroupOptions {
  /** The search box's query; empty lists every card. */
  query?: string;
  sortBy: SortMode;
  groupBy: GroupMode;
}

/** A view's cards as it lists them: filtered by its search, sorted, then grouped. */
export function buildCardGroups(
  cards: readonly HandCard[],
  metaByName: ReadonlyMap<string, ZoneViewCardMetadata>,
  { query = '', sortBy, groupBy }: CardGroupOptions,
): CardGroup[] {
  const enriched: EnrichedCard[] = [];
  for (const handCard of cards) {
    const meta = metaByName.get(handCard.name) ?? placeholderMeta(handCard.name);
    if (matchesQuery(meta, query)) {
      enriched.push({ handCard, meta });
    }
  }
  enriched.sort((a, b) => compareCards(a.meta, b.meta, sortBy));
  return groupCards(enriched, groupBy);
}
