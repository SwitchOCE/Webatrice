import { useState } from 'react';

export interface ValueFlash {
  /** Fresh for every change, so the flash restarts when the value changes again mid-flash. */
  key: number;
  direction: 'gain' | 'loss';
}

/**
 * The flash for the latest change of `value`: none on mount (the value was already there), one
 * per change after it while `enabled`. Desktop flashes a counter when its value changes
 * (PlayerCounter::onValueChanged) and the battlefield when life drops
 * (PlayerGraphicsItem::onCounterAdded).
 */
export function useValueFlash(value: number | undefined, enabled: boolean): ValueFlash | null {
  const [previous, setPrevious] = useState(value);
  const [flash, setFlash] = useState<ValueFlash | null>(null);
  if (value !== previous) {
    setPrevious(value);
    if (enabled && value !== undefined && previous !== undefined) {
      setFlash({ key: (flash?.key ?? 0) + 1, direction: value > previous ? 'gain' : 'loss' });
    } else {
      setFlash(null);
    }
  }
  return flash;
}
