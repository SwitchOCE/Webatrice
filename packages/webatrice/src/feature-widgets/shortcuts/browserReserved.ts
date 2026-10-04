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

// Left off the list on purpose, because the page still receives them in at
// least one supported browser and desktop binds them by default:
//   - Ctrl+L (game.setLife) focuses the address bar, but Chromium and
//     Firefox let the page cancel it.
//   - Ctrl+Q (game.leaveGame) quits Firefox on Linux before the page sees it.
//   - Alt+1…9 (game.sayMacro*) switch tabs in Chromium and Firefox on Linux.
// The last two are a known gap on Linux, kept as desktop binds them until
// the follow-up decides whether to remap them there.
