import { createRequiredContext } from './createRequiredContext';
import type { PendingTargetPicker } from '../../hooks/usePendingTarget';

// The game's one pending target pick (usePendingTarget), provided by Game to
// every seat: the card menus and shortcuts start picks, the seat's press
// release resolves an attach, and the seat draws the live arrow from its card.
export const [PendingTargetProvider, usePendingTargetContext] =
  createRequiredContext<PendingTargetPicker>('PendingTargetContext');
