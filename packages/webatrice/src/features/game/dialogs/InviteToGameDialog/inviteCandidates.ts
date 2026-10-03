import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';

export type InviteRow =
  | { kind: 'header'; section: 'buddies' | 'online' }
  | { kind: 'user'; name: string };

export interface InviteCandidateInput {
  /** Online users, keyed by name (server.users). */
  users: Record<string, ServerInfo_User>;
  buddyList: Record<string, ServerInfo_User>;
  ignoreList: Record<string, ServerInfo_User>;
  /** Self, every player and every spectator of the game (tab_game.cpp actInviteToGame). */
  excludeNames: ReadonlySet<string>;
  /** The game's only_buddies flag: list buddies only. */
  onlyBuddies: boolean;
  search: string;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * The rows of desktop's DlgInviteToGame user list: online users who are not
 * excluded and not ignored, filtered by the search text, in a Buddies section
 * and (unless the game is buddies-only) an Online section. Empty sections are
 * left out.
 */
export function buildInviteRows({
  users,
  buddyList,
  ignoreList,
  excludeNames,
  onlyBuddies,
  search,
}: InviteCandidateInput): InviteRow[] {
  const needle = search.trim().toLowerCase();
  const buddies: string[] = [];
  const online: string[] = [];
  for (const name of Object.keys(users)) {
    if (excludeNames.has(name) || ignoreList[name]) {
      continue;
    }
    if (needle && !name.toLowerCase().includes(needle)) {
      continue;
    }
    if (buddyList[name]) {
      buddies.push(name);
    } else if (!onlyBuddies) {
      online.push(name);
    }
  }

  const rows: InviteRow[] = [];
  if (buddies.length > 0) {
    rows.push({ kind: 'header', section: 'buddies' });
    rows.push(...buddies.sort(byName).map((name): InviteRow => ({ kind: 'user', name })));
  }
  if (online.length > 0) {
    rows.push({ kind: 'header', section: 'online' });
    rows.push(...online.sort(byName).map((name): InviteRow => ({ kind: 'user', name })));
  }
  return rows;
}
