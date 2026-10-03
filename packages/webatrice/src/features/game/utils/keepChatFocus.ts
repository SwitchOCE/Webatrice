/** Elements a click must still focus: anything the user types or picks into. */
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Desktop's "Keep game chat focused when clicking in game": the game view takes no focus
 * (GameView::setFocusDisabled), so clicking a card or the table leaves the chat line focused and
 * typing keeps going to the chat. In the browser, focus moves on the press, so the board's press
 * is told not to move it, except onto a field the press is meant to focus (a prompt's input).
 * Clicks, drags and menus are unaffected.
 */
export function keepFocusOnBoardPress(e: Pick<MouseEvent, 'target' | 'preventDefault'>): void {
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(EDITABLE)) {
    return;
  }
  e.preventDefault();
}
