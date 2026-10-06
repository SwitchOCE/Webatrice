type SessionEndHandler = () => void;
const handlers = new Set<SessionEndHandler>();
let ending = false;

/**
 * Register synchronous cleanup for state that cannot remount (module caches,
 * request trackers). Returns an unsubscribe function; registration survives
 * session boundaries until unsubscribed. Each registration is independent.
 */
export function onSessionEnd(handler: SessionEndHandler): () => void {
  const registration = () => handler();
  handlers.add(registration);
  return () => {
    handlers.delete(registration);
  };
}

/** Called only by the app's SessionScope when the store's session epoch changes. */
export function endSession(): void {
  if (ending) {
    return;
  }
  ending = true;
  try {
    // A handler added during cleanup belongs to the next session boundary.
    for (const handler of [...handlers]) {
      if (!handlers.has(handler)) {
        continue;
      }
      try {
        handler();
      } catch (error) {
        console.error('Session cleanup failed:', error);
      }
    }
  } finally {
    ending = false;
  }
}
