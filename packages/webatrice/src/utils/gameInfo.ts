import type { TFunction } from 'i18next';

import type { ServerInfo_Game } from '@cockatrice/sockatrice/generated';

// Cell text for a game's Restrictions and Spectators columns, shared by every
// game list (a room's games, a user's games). Desktop GamesModel::data.

export function formatRestrictions(t: TFunction, info: ServerInfo_Game): string {
  const parts: string[] = [];
  if (info.withPassword) {
    parts.push(t('GameInfo.restriction.password'));
  }
  if (info.onlyBuddies) {
    parts.push(t('GameInfo.restriction.buddiesOnly'));
  }
  if (info.onlyRegistered) {
    parts.push(t('GameInfo.restriction.registeredOnly'));
  }
  if (info.shareDecklistsOnLoad) {
    parts.push(t('GameInfo.restriction.openDecklists'));
  }
  return parts.join(', ');
}

export function formatSpectators(t: TFunction, info: ServerInfo_Game): string {
  if (!info.spectatorsAllowed) {
    return t('GameInfo.spectators.notAllowed');
  }
  const flags: string[] = [];
  if (info.spectatorsCanChat) {
    flags.push(t('GameInfo.spectators.canChat'));
  }
  if (info.spectatorsOmniscient) {
    flags.push(t('GameInfo.spectators.seeHands'));
  }
  if (flags.length === 0) {
    return String(info.spectatorsCount);
  }
  return t('GameInfo.spectators.countWithFlags', { count: info.spectatorsCount, flags: flags.join(' & ') });
}
