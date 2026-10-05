import { PlayerEntry } from '@cockatrice/datatrice';
import type { TFunction } from 'i18next';

// The display name for a player, falling back to the shared translated player
// number when the server hasn't sent a userInfo name yet. Shared by the reveal
// target list, turn controls, and game-info dialog so the format stays consistent.
export function playerName(player: PlayerEntry, t: TFunction): string {
  return player.properties.userInfo?.name
    ?? t('GameLog.player.number', { id: player.properties.playerId });
}
