import type { Tab } from '../topBarTabs';
import { titleTabFor } from './useSessionTabs';

const lobby: Tab = { key: 'server', type: 'server', title: 'Lobby', route: '/server', closeable: false };
const room: Tab = { key: 'room:1', type: 'room', title: 'Magic', route: '/room/1', closeable: true };

describe('titleTabFor', () => {
  it('uses the open tab for the current route', () => {
    expect(titleTabFor([lobby, room], '/room/1')).toBe(room);
  });

  it('derives the page from the route when the strip has no tab for it', () => {
    expect(titleTabFor([lobby], '/decks')).toEqual(expect.objectContaining({ key: 'decks', titleKey: 'TopBar.tab.myDecks' }));
    expect(titleTabFor([lobby], '/replays')).toEqual(expect.objectContaining({ key: 'replays' }));
  });

  it('falls back to the Lobby for a route without a page of its own', () => {
    expect(titleTabFor([lobby], '/game/9')).toBe(lobby);
  });
});
