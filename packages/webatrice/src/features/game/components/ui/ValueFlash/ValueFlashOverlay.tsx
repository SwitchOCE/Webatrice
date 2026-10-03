import type { ValueFlash } from './useValueFlash';

import './ValueFlash.css';

/**
 * Plays a flash over its positioned parent: the life change's own colour, or the battlefield's
 * damage wash. Keyed by the flash, so a new change restarts it.
 */
export default function ValueFlashOverlay({ flash, kind }: { flash: ValueFlash | null; kind: 'change' | 'damage' }) {
  if (!flash || (kind === 'damage' && flash.direction !== 'loss')) {
    return null;
  }
  const modifier = kind === 'damage' ? 'damage' : flash.direction;
  return <span key={flash.key} aria-hidden data-testid={`value-flash-${modifier}`} className={`value-flash value-flash--${modifier}`} />;
}
