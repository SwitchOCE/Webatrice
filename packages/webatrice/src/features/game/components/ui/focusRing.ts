/**
 * The focus indicator every keyboard-operable control on the game screen draws: a 2px accent
 * ring, shown for keyboard focus only (`:focus-visible`), so a pointer press leaves no ring. The
 * ring is a box-shadow, so it follows the control's rounded corners and needs no outline.
 */
export const GAME_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent '
  + 'focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface';
