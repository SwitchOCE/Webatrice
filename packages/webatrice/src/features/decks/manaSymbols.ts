/**
 * MTG colour and mana-symbol vocabulary shared by the deck editor's
 * filters, stats and symbol renderers. Symbol art comes from Scryfall's
 * public SVG CDN.
 */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** WUBRG order plus colorless. */
export const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

/** Matches every `{…}` symbol token in a cost or rules-text string. */
export const MANA_TOKEN_RE = /\{[^}]+\}/g;

const SINGLE_TOKEN_RE = /^\{[^}]+\}$/;

export function isManaToken(s: string): boolean {
  return SINGLE_TOKEN_RE.test(s);
}

/**
 * Scryfall CDN URL for a symbol. Accepts a bare symbol (`W`, `2`) or a
 * braced token (`{W/U}`). Hybrid/phyrexian tokens drop the slash on the
 * CDN (`{W/U}` → `WU.svg`, `{2/W}` → `2W.svg`).
 */
export function manaSymbolUrl(symbol: string): string {
  const inner = SINGLE_TOKEN_RE.test(symbol) ? symbol.slice(1, -1) : symbol;
  return `https://svgs.scryfall.io/card-symbols/${inner.replace(/\//g, '')}.svg`;
}

/** Split a cost string such as `{2}{U}{R}` into its symbol tokens. */
export function manaCostTokens(cost: string): string[] {
  return cost.match(MANA_TOKEN_RE) ?? [];
}
