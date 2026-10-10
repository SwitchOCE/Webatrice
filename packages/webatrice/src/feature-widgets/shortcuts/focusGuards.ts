
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';

const BOARD_SELECTOR = '[data-game-board]';
const CARD_SELECTOR = '[data-card-id]';

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
  '[role="spinbutton"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function keepsTabNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(OVERLAY_SELECTOR) !== null) {
    return true;
  }
  if (target.closest(CARD_SELECTOR) !== null || target.matches(BOARD_SELECTOR)) {
    return false;
  }
  return target.matches(CONTROL_SELECTOR);
}

export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector('[aria-modal="true"]') !== null;
}

export function isTabNavigationKey(event: KeyboardEvent): boolean {
  return event.code === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey;
}
