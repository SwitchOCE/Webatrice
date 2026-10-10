import { RouteEnum } from '@app/types';

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
  it('counts rooms and games on Play and chats on People', () => {
    expect(placeBadges({ rooms: { 1: 2, 4: 1 }, games: { 7: 3 }, chats: { bob: 1, ann: 2 } })).toEqual({ play: 6, people: 3 });
  });

  it('is zero with nothing unread', () => {
    expect(placeBadges({ rooms: {}, games: {}, chats: {} })).toEqual({ play: 0, people: 0 });
  });
});
