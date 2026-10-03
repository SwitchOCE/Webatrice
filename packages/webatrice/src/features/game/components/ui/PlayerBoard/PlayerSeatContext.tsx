import { createRequiredContext } from '../createRequiredContext';
import type { PlayerSeat } from './usePlayerSeat';

// One seat's controller (usePlayerSeat), provided by PlayerBoard to the regions
// it composes: the player info column, the zone piles, the stack, the
// battlefield, the hand and the seat's card menus.
export const [PlayerSeatProvider, usePlayerSeatContext] = createRequiredContext<PlayerSeat>('PlayerSeatContext');
