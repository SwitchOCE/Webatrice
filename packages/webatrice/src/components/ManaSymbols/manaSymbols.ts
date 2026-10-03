/** Matches every `{…}` symbol token in a cost or rules-text string. */
export const MANA_TOKEN_RE = /\{[^}]+\}/g;

const SINGLE_TOKEN_RE = /^\{[^}]+\}$/;

export function isManaToken(s: string): boolean {
  return SINGLE_TOKEN_RE.test(s);
}

/** Split a cost string such as `{2}{U}{R}` into its symbol tokens. */
export function manaCostTokens(cost: string): string[] {
  return cost.match(MANA_TOKEN_RE) ?? [];
}
