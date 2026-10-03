// Where the window-level shortcut listener must step aside so keyboard
// navigation keeps working. Sanctioned accessibility divergence from desktop
// (webatrice.instructions.md, divergence protocol item 3): desktop binds Tab to Next Phase,
// but its dialogs and menus are separate windows that never see that key.

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';

const CONTROL_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a[href]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="option"]',
  '[contenteditable="true"]',
].join(', ');

/**
 * True when Tab / Shift+Tab should move focus instead of firing a shortcut:
 * focus is inside a dialog, menu or modal, or on a form control or button.
 * On the page body or the board, Tab keeps desktop's Next Phase binding.
 */
export function keepsTabNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(OVERLAY_SELECTOR) !== null || target.matches(CONTROL_SELECTOR);
}

/**
 * True while a modal is open anywhere in the document. Route-scoped shortcuts
 * (game, deck editor, room, replays) then stand down, so only GLOBAL actions
 * fire and Escape reaches the modal instead of, say, closing a zone view.
 */
export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector('[aria-modal="true"]') !== null;
}

/** A plain or Shift+Tab press: the keys browsers use to move focus. */
export function isTabNavigationKey(event: KeyboardEvent): boolean {
  return event.code === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey;
}
