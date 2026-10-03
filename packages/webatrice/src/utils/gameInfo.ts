import type { ServerInfo_Game } from '@cockatrice/sockatrice/generated';

// Cell text for a game's Restrictions and Spectators columns, shared by every
// game list (a room's games, a user's games).

export function formatRestrictions(info: ServerInfo_Game): string {
  const parts: string[] = [];
  if (info.withPassword) {
    parts.push('password');
  }
  if (info.onlyBuddies) {
    parts.push('buddies only');
  }
  if (info.onlyRegistered) {
    parts.push('reg. users only');
  }
  if (info.shareDecklistsOnLoad) {
    parts.push('open decklists');
  }
  return parts.join(', ');
}

export function formatSpectators(info: ServerInfo_Game): string {
  if (!info.spectatorsAllowed) {
    return 'not allowed';
  }
  const flags: string[] = [];
  if (info.spectatorsCanChat) {
    flags.push('can chat');
  }
  if (info.spectatorsOmniscient) {
    flags.push('see hands');
  }
  if (flags.length === 0) {
    return String(info.spectatorsCount);
  }
  return `${info.spectatorsCount} (${flags.join(' & ')})`;
}
