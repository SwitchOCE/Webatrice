import type { Game, GametypeMap } from '@cockatrice/datatrice';
import type { ServerInfo_Game } from '@cockatrice/sockatrice/generated';

import type { Availability } from '../ds';

export type JoinBlock = 'started' | 'full';

export interface GameCardActions {
  canJoin: boolean;
  joinBlock?: JoinBlock;
  joinNeedsPassword: boolean;
  canSpectate: boolean;
  spectateNeedsPassword: boolean;
}

export function gameAvailability(info: ServerInfo_Game): Availability {
  if (info.started) {
    return 'started';
  }
  if (info.playerCount >= info.maxPlayers) {
    return 'full';
  }
  if (info.withPassword) {
    return 'password';
  }
  if (info.onlyBuddies) {
    return 'buddies';
  }
  return 'open';
}

export function hasOpenSeat(info: ServerInfo_Game): boolean {
  return !info.started && info.playerCount < info.maxPlayers;
}

export function gameTypeNames(game: Game, gametypeMap?: GametypeMap): string[] {
  const names = (game.info.gameTypes ?? [])
    .map((id) => gametypeMap?.[id])
    .filter((name): name is string => Boolean(name));
  if (names.length) {
    return names;
  }
  return game.gameType ? [game.gameType] : [];
}

export function gameCardActions(
  info: ServerInfo_Game,
  { overrideRestrictions = false, alreadyJoined = false }: { overrideRestrictions?: boolean; alreadyJoined?: boolean } = {},
): GameCardActions {
  const joinNeedsPassword = info.withPassword && !overrideRestrictions && !alreadyJoined;
  const spectateNeedsPassword = info.withPassword && info.spectatorsNeedPassword && !overrideRestrictions && !alreadyJoined;
  const canSpectate = alreadyJoined || info.spectatorsAllowed || overrideRestrictions;
  if (alreadyJoined) {
    return { canJoin: true, joinNeedsPassword, canSpectate, spectateNeedsPassword };
  }
  if (info.started) {
    return { canJoin: false, joinBlock: 'started', joinNeedsPassword, canSpectate, spectateNeedsPassword };
  }
  if (info.playerCount >= info.maxPlayers && !overrideRestrictions) {
    return { canJoin: false, joinBlock: 'full', joinNeedsPassword, canSpectate, spectateNeedsPassword };
  }
  return { canJoin: true, joinNeedsPassword, canSpectate, spectateNeedsPassword };
}
