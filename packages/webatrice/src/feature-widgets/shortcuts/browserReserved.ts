// Chords the browser keeps for itself (reload, fullscreen, devtools, tab
// and window management): Chromium handles them before the page sees the
// event, so `preventDefault()` cannot claim them. A desktop default on one
// of these is rebound in `defaults.ts`, and `defaults.spec.ts` checks that
// no default lands on one.
export const BROWSER_RESERVED_SEQUENCES: readonly string[] = [
  'F5', 'F11', 'F12',
  'Ctrl+KeyT', 'Ctrl+Shift+KeyT', 'Ctrl+KeyW', 'Ctrl+Shift+KeyW', 'Ctrl+KeyN', 'Ctrl+Shift+KeyN',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Alt+F4',
  'Ctrl+Digit1', 'Ctrl+Digit2', 'Ctrl+Digit3', 'Ctrl+Digit4', 'Ctrl+Digit5',
  'Ctrl+Digit6', 'Ctrl+Digit7', 'Ctrl+Digit8', 'Ctrl+Digit9', 'Ctrl+Digit0',
];
