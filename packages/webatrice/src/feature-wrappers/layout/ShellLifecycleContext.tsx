import { createContext, useContext, type ReactNode } from 'react';

/**
 * Shell events that feature slices may need to react to. Page chrome
 * reports the event; the root `AppShell` decides which features clean up.
 * This keeps the wrapper layer from importing features (see
 * eslint.boundaries.mjs).
 */
export interface ShellLifecycle {
  /**
   * The signed-in `(server, user)` differs from the one the persisted
   * shell state belongs to. Server-scoped ids cached by features (e.g.
   * deck ids) are no longer valid.
   */
  onIdentityChanged: () => void;
}

// No default: TopBar's identity check is the only path that clears
// server-scoped feature caches, so a tree without the provider must
// fail loudly rather than silently skip that cleanup.
const ShellLifecycleContext = createContext<ShellLifecycle | null>(null);

export function ShellLifecycleProvider({ value, children }: { value: ShellLifecycle; children: ReactNode }) {
  return <ShellLifecycleContext.Provider value={value}>{children}</ShellLifecycleContext.Provider>;
}

export function useShellLifecycle(): ShellLifecycle {
  const lifecycle = useContext(ShellLifecycleContext);
  if (!lifecycle) {
    throw new Error('useShellLifecycle must be used inside <ShellLifecycleProvider>');
  }
  return lifecycle;
}
