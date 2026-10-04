/**
 * MTG colour vocabulary shared by the deck editor's filters and stats.
 * Symbol rendering lives in `@app/components` (`ManaSymbols`).
 */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** WUBRG order plus colorless. */
export const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

