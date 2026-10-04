import { useState } from 'react';

import { useJustRewound } from '../ReplayRewindContext';

export interface ValueFlash {
  /** Fresh for every change, so the flash restarts when the value changes again mid-flash. */
  key: number;
  direction: 'gain' | 'loss';
}

export interface ValueFlashOptions {
  /** `'loss'`: a gain neither flashes nor cuts off a running flash (the battlefield's wash). */
  only?: 'loss';
}

/**
 * The flash for the latest change of `value`: none on mount (the value was already there), one
 * per change after it while `enabled`, and none for a change a replay rewind made. Desktop flashes
 * a counter when its value changes (PlayerCounter::onValueChanged) and the battlefield only when
 * life drops (PlayerGraphicsItem::onCounterAdded), leaving a running shimmer alone on a gain.
 */
export function useValueFlash(
  value: number | undefined,
  enabled: boolean,
  { only }: ValueFlashOptions = {},
): ValueFlash | null {
  const [previous, setPrevious] = useState(value);
  const [flash, setFlash] = useState<ValueFlash | null>(null);
  const justRewound = useJustRewound();
  if (value !== previous) {
    setPrevious(value);
    const direction = value !== undefined && previous !== undefined ? (value > previous ? 'gain' : 'loss') : null;
    if (enabled && !justRewound && direction && (only === undefined || direction === only)) {
      setFlash({ key: (flash?.key ?? 0) + 1, direction });
    } else if (!enabled || justRewound || !direction) {
      setFlash(null);
    }
  }
  return flash;
}
