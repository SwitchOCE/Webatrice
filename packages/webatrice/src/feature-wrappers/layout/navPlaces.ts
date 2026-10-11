import { matchPath } from 'react-router-dom';
import { Film, Library, Settings, ShieldCheck, Swords, Users, type LucideIcon } from 'lucide-react';

import type { MentionCounts } from '@app/services';
import { PlayBadgeMode, RouteEnum } from '@app/types';

import { STAFF_ROUTES } from '../staff/staffTools';
import type { TabUnreadCounts } from './topBarTabs';

export type PlaceKey = 'play' | 'decks' | 'replays' | 'people' | 'staff' | 'settings';

export const PLACE_LABEL_KEYS: Record<PlaceKey, string> = {
  play: 'NavRail.place.play',
  decks: 'NavRail.place.decks',
  replays: 'NavRail.place.replays',
  people: 'NavRail.place.people',
  staff: 'NavRail.place.staff',
  settings: 'NavRail.place.settings',
};

export interface NavPlace {
  key: PlaceKey;
  icon: LucideIcon;
  route: RouteEnum;
}

export const NAV_PLACES: readonly NavPlace[] = [
  { key: 'play', icon: Swords, route: RouteEnum.SERVER },
  { key: 'decks', icon: Library, route: RouteEnum.DECKS },
  { key: 'replays', icon: Film, route: RouteEnum.REPLAYS },
  { key: 'people', icon: Users, route: RouteEnum.PEOPLE },
  { key: 'settings', icon: Settings, route: RouteEnum.SETTINGS },
];

export function railPlaces(staffHome: RouteEnum | null): NavPlace[] {
  if (staffHome === null) {
    return [...NAV_PLACES];
  }
  const staff: NavPlace = { key: 'staff', icon: ShieldCheck, route: staffHome };
  return NAV_PLACES.flatMap((place) => (place.key === 'settings' ? [staff, place] : [place]));
}

const PLACE_ROUTES: readonly [PlaceKey, readonly RouteEnum[]][] = [
  ['play', [RouteEnum.SERVER, RouteEnum.ROOM, RouteEnum.GAME]],
  ['decks', [RouteEnum.DECKS, RouteEnum.DECK, RouteEnum.DECK_DRAFT, RouteEnum.SHARED_DECK, RouteEnum.PUBLIC_DECKS]],
  ['replays', [RouteEnum.REPLAYS, RouteEnum.REPLAY]],
  ['people', [RouteEnum.PEOPLE, RouteEnum.PLAYER]],
  ['staff', STAFF_ROUTES],
  ['settings', [RouteEnum.SETTINGS]],
];

export function placeForPath(pathname: string): PlaceKey | null {
  const found = PLACE_ROUTES.find(([, routes]) => routes.some((path) => matchPath({ path, end: true }, pathname)));
  return found ? found[0] : null;
}

const sum = (counts: Readonly<Record<string | number, number>>) =>
  Object.values(counts).reduce((total, n) => total + n, 0);

export interface PlaceBadgeCounts extends TabUnreadCounts {
  chats: Readonly<Record<string, number>>;
  mentions: MentionCounts;
}

export function placeBadges(
  counts: PlaceBadgeCounts,
  playBadge: PlayBadgeMode,
  unresolvedReports: number | null = null,
): Partial<Record<PlaceKey, number>> {
  const play = playBadge === PlayBadgeMode.All ? counts : counts.mentions;
  return {
    play: sum(play.rooms) + sum(play.games),
    people: sum(counts.chats),
    ...(unresolvedReports ? { staff: unresolvedReports } : {}),
  };
}
