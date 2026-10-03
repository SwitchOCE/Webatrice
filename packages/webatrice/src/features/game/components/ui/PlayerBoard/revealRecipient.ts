import { ALL_PLAYERS } from '../../../dialogs/RevealCardsDialog/revealRecipient';
import type { RevealRecipient } from './playerBoard.types';

/** The seat menus' reveal target, with the dialogs' "All players" sentinel, as a reveal recipient. */
export const toRecipient = (targetPlayerId: number): RevealRecipient =>
  (targetPlayerId === ALL_PLAYERS ? 'all' : targetPlayerId);
