import { CARD_COUNTER_COLOR_KEYS, PREFERENCE_DEFAULTS } from '@app/types';

// See .github/instructions/webatrice-game.instructions.md#servatrice-game-event-quirks.
export const COUNTER_TYPE_COUNT = 6;
export const COUNTER_TYPE_LABELS: ReadonlyArray<string> = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Desktop's default counter colours, QColor::fromHsv(id × 60, 150, 255), as hex without '#'. */
export const DEFAULT_COUNTER_COLORS: ReadonlyArray<string> = CARD_COUNTER_COLOR_KEYS.map((key) => PREFERENCE_DEFAULTS[key]);

/**
 * The colour of card counter `id`: the user's colour from Appearance › Card counters, which the
 * app root sets as `--card-counter-<id>` (useApplyCardPresentation), else desktop's default.
 */
export function counterColorForId(id: number): string {
  const slot = ((id % COUNTER_TYPE_COUNT) + COUNTER_TYPE_COUNT) % COUNTER_TYPE_COUNT;
  return `var(--card-counter-${slot}, #${DEFAULT_COUNTER_COLORS[slot]})`;
}
