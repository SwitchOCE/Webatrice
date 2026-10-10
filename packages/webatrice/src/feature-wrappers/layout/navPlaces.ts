import { matchPath } from 'react-router-dom';
import { Film, Library, Settings, Swords, Users, type LucideIcon } from 'lucide-react';

import { RouteEnum } from '@app/types';

import type { TabUnreadCounts } from './topBarTabs';

export type PlaceKey = 'play' | 'decks' | 'replays' | 'people' | 'settings';

export const PLACE_LABEL_KEYS: Record<PlaceKey, string> = {
  play: 'NavRail.place.play',
  decks: 'NavRail.place.decks',
  replays: 'NavRail.place.replays',
  people: 'NavRail.place.people',
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

const PLACE_ROUTES: readonly [PlaceKey, readonly RouteEnum[]][] = [
  ['play', [RouteEnum.SERVER, RouteEnum.ROOM, RouteEnum.GAME]],
  ['decks', [RouteEnum.DECKS, RouteEnum.DECK, RouteEnum.DECK_DRAFT, RouteEnum.SHARED_DECK, RouteEnum.PUBLIC_DECKS]],
  ['replays', [RouteEnum.REPLAYS, RouteEnum.REPLAY]],
  ['people', [RouteEnum.PEOPLE, RouteEnum.PLAYER]],
  ['settings', [RouteEnum.SETTINGS]],
];

export function placeForPath(pathname: string): PlaceKey | null {
  const found = PLACE_ROUTES.find(([, routes]) => routes.some((path) => matchPath({ path, end: true }, pathname)));
  return found ? found[0] : null;
}

const sum = (counts: Readonly<Record<string | number, number>>) =>
  Object.values(counts).reduce((total, n) => total + n, 0);

export function placeBadges(counts: TabUnreadCounts): Partial<Record<PlaceKey, number>> {
  return {
    play: sum(counts.rooms) + sum(counts.games),
    people: sum(counts.chats),
  };
}
