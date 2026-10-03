import { useEffect } from 'react';

/**
 * Call `onEscape` when Escape is pressed while `active`. Listens on
 * `document` by default; pass `window` to sit behind document-level
 * listeners.
 */
export function useEscapeKey(
  active: boolean,
  onEscape: () => void,
  target: Document | Window = document,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        onEscape();
      }
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [active, onEscape, target]);
}
