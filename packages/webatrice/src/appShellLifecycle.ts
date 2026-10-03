import type { ShellLifecycle } from '@app/feature-wrappers/layout';
import { clearDeckEditorCache, clearDecksListCache } from '@app/features/decks';

/**
 * Feature cleanup for shell events reported by the page chrome. Lives at
 * the root because only `AppShell` may compose features; the chrome
 * reports the event without knowing which caches exist.
 */
export const appShellLifecycle: ShellLifecycle = {
  // Deck ids are per-user on Servatrice, so cached deck lists and
  // hydrated decks from a previous identity point at the wrong decks.
  onIdentityChanged: () => {
    clearDeckEditorCache();
    clearDecksListCache();
  },
};
