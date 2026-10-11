import { useCallback, useRef } from 'react';

type FocusRef = (node: HTMLElement | null) => void;

export function usePaneFocusHandoff() {
  const pending = useRef<string | null>(null);
  const refs = useRef(new Map<string, FocusRef>());

  const target = useCallback((key: string): FocusRef => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (node) => {
        if (node && pending.current === key) {
          pending.current = null;
          node.focus();
        }
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  const handOff = useCallback((key: string) => {
    pending.current = key;
  }, []);

  return { target, handOff };
}
