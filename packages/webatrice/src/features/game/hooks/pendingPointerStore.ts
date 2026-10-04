export interface PendingPointer {
  x: number;
  y: number;
}

/**
 * The pointer while a target pick is pending, outside React state so a mouse
 * move re-renders only what draws the live arrow (`usePendingPointer`), not
 * every consumer of the game's pending pick.
 */
export interface PendingPointerStore {
  get(): PendingPointer | null;
  set(pointer: PendingPointer | null): void;
  subscribe(listener: () => void): () => void;
}

export function createPendingPointerStore(): PendingPointerStore {
  let current: PendingPointer | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (pointer) => {
      if (pointer === current) {
        return;
      }
      current = pointer;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
