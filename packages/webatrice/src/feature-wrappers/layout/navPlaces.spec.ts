import { PlayBadgeMode, PREFERENCE_DEFAULTS, RouteEnum } from '@app/types';

import { NAV_PLACES, placeBadges, placeForPath } from './navPlaces';

describe('NAV_PLACES', () => {
  it('lists Play, Decks, Replays, People and Settings in rail order', () => {
    expect(NAV_PLACES.map(({ key, route }) => [key, route])).toEqual([
      ['play', RouteEnum.SERVER],
      ['decks', RouteEnum.DECKS],
      ['replays', RouteEnum.REPLAYS],
      ['people', RouteEnum.PEOPLE],
      ['settings', RouteEnum.SETTINGS],
    ]);
  });
});

describe('placeForPath', () => {
  it.each([
    ['/server', 'play'],
    ['/room/3', 'play'],
    ['/game/12', 'play'],
    ['/decks', 'decks'],
    ['/deck/4', 'decks'],
    ['/deck/draft/abc', 'decks'],
    ['/decks/public/bob', 'decks'],
    ['/replays', 'replays'],
    ['/replay/k1', 'replays'],
    ['/people', 'people'],
    ['/player/bob', 'people'],
    ['/settings', 'settings'],
  ])('lights %s as %s', (path, place) => {
    expect(placeForPath(path)).toBe(place);
  });

  it('lights nothing for account and staff pages', () => {
    expect(placeForPath('/account')).toBeNull();
    expect(placeForPath('/report-queue')).toBeNull();
    expect(placeForPath('/shortcuts')).toBeNull();
  });
});

describe('placeBadges', () => {
  const counts = {
    rooms: { 1: 2, 4: 1 },
    games: { 7: 3 },
    chats: { bob: 1, ann: 2 },
    mentions: { rooms: { 4: 1 }, games: { 7: 1 } },
  };

  it('counts only mentions in rooms and games on Play by default, and chats on People', () => {
    expect(placeBadges(counts, PREFERENCE_DEFAULTS.playBadge)).toEqual({ play: 2, people: 3 });
  });

  it('counts all room and game activity on Play when asked to', () => {
    expect(placeBadges(counts, PlayBadgeMode.All)).toEqual({ play: 6, people: 3 });
  });

  it('is zero with nothing unread', () => {
    const none = { rooms: {}, games: {}, chats: {}, mentions: { rooms: {}, games: {} } };
    expect(placeBadges(none, PlayBadgeMode.Mentions)).toEqual({ play: 0, people: 0 });
    expect(placeBadges(none, PlayBadgeMode.All)).toEqual({ play: 0, people: 0 });
  });
});
