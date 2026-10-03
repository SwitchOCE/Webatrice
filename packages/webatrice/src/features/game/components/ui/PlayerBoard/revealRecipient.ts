import type { RevealRecipient } from './playerBoard.types';

/** The seat menus' "-1 = every player" reveal target, as a reveal recipient. */
export const toRecipient = (targetPlayerId: number): RevealRecipient => (targetPlayerId === -1 ? 'all' : targetPlayerId);
