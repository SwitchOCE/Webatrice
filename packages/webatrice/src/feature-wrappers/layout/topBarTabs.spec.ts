import { create } from '@bufbuild/protobuf';
import type { TFunction } from 'i18next';

import {
  Response_DeckListSchema,
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
  type ServerInfo_DeckStorage_TreeItem,
} from '@cockatrice/sockatrice/generated';
import { RouteEnum } from '@app/types';

import {
  addStickyTab,
  deckIdOfTab,
  detectTransientTab,
  flattenDeckNames,
  isStickyTabType,
  routeMatches,
  tabTitle,
  withDeckNames,
  type Tab,
} from './topBarTabs';

const deckTab = (id: string): Tab => detectTransientTab(`/deck/${id}`)!;

describe('detectTransientTab', () => {
  it.each([
    ['/decks', { key: 'decks', type: 'decks', titleKey: 'TopBar.tab.myDecks' }],
    ['/deck/12', { key: 'deck:12', type: 'deck', titleKey: 'TopBar.tab.deck', titleParams: { id: '12' } }],
    ['/deck/draft/abc', { key: 'deck-draft:abc', type: 'deck', titleKey: 'TopBar.tab.unsavedDeck' }],
    ['/settings', { key: 'settings', type: 'settings', titleKey: 'UserMenu.settings' }],
    ['/shortcuts', { key: 'shortcuts', type: 'shortcuts', titleKey: 'UserMenu.shortcuts' }],
    ['/account', { key: 'account', type: 'account', titleKey: 'UserMenu.account' }],
    ['/logs', { key: 'logs', type: 'logs', titleKey: 'UserMenu.logs' }],
    ['/administration', { key: 'administration', type: 'staff', titleKey: 'UserMenu.administration' }],
    ['/report-queue', { key: 'report-queue', type: 'staff', titleKey: 'UserMenu.reportQueue' }],
    ['/my-reports', { key: 'my-reports', type: 'my-reports', titleKey: 'UserMenu.myReports' }],
    ['/player/alice', { key: 'player:alice', type: 'player', title: 'alice' }],
    ['/replays', { key: 'replays', type: 'replays', titleKey: 'TopBar.replays.tab' }],
    ['/replay/r1', { key: 'replay:r1', type: 'replay', titleKey: 'TopBar.replayTab' }],
  ])('makes a closeable tab for %s', (pathname, expected) => {
    expect(detectTransientTab(pathname)).toEqual({ ...expected, route: pathname, closeable: true });
  });

  it('names a public deck list after its owner', () => {
    const pathname = RouteEnum.PUBLIC_DECKS.replace(':userName', 'bob');

    expect(detectTransientTab(pathname)).toMatchObject({
      key: 'public-decks:bob', type: 'decks', titleKey: 'TopBar.tab.publicDecks', titleParams: { name: 'bob' },
    });
  });

  it.each([RouteEnum.SERVER, '/room/1', '/game/2', '/nowhere'])('makes none for %s', (pathname) => {
    expect(detectTransientTab(pathname)).toBeNull();
  });
});

describe('isStickyTabType', () => {
  it('keeps deck lists, decks, shortcuts and private chats', () => {
    expect(['decks', 'deck', 'shortcuts', 'player'].every((type) => isStickyTabType(type as Tab['type']))).toBe(true);
  });

  it('lets every other page go when the user leaves it', () => {
    expect(['server', 'room', 'game', 'settings', 'account', 'logs', 'staff', 'replays', 'replay', 'my-reports']
      .some((type) => isStickyTabType(type as Tab['type']))).toBe(false);
  });
});

describe('deckIdOfTab', () => {
  it('reads the server deck id of a saved deck', () => {
    expect(deckIdOfTab(deckTab('42'))).toBe(42);
  });

  it('has none for a draft or any other tab', () => {
    expect(deckIdOfTab(detectTransientTab('/deck/draft/abc')!)).toBeNull();
    expect(deckIdOfTab(detectTransientTab('/decks')!)).toBeNull();
  });
});

describe('tabTitle', () => {
  const t = ((key: string, params?: Record<string, string>) => `${key}${params ? JSON.stringify(params) : ''}`) as TFunction;

  it('prefers the tab\'s own name', () => {
    expect(tabTitle({ ...deckTab('1'), title: 'Burn' }, t)).toBe('Burn');
  });

  it('translates the catalogue title with its params', () => {
    expect(tabTitle(deckTab('1'), t)).toBe('TopBar.tab.deck{"id":"1"}');
  });
});

describe('routeMatches', () => {
  it('matches a route pattern exactly', () => {
    expect(routeMatches('/room/3', RouteEnum.ROOM)).toBe(true);
    expect(routeMatches('/room/3/extra', RouteEnum.ROOM)).toBe(false);
  });

  it('never matches the wildcard route', () => {
    expect(routeMatches('/anything', '*')).toBe(false);
  });
});

describe('addStickyTab', () => {
  it('appends a new tab and leaves a known one in place', () => {
    const one = [deckTab('1')];
    const two = addStickyTab(one, deckTab('2'));

    expect(two.map(({ key }) => key)).toEqual(['deck:1', 'deck:2']);
    expect(addStickyTab(two, deckTab('1'))).toBe(two);
  });

  it('puts a deck loaded into a tab in that tab\'s place', () => {
    const next = addStickyTab([deckTab('1'), deckTab('2')], deckTab('3'), 1);

    expect(next.map(({ key }) => key)).toEqual(['deck:3', 'deck:2']);
  });

  it('closes the replaced tab when the loaded deck already has one', () => {
    const next = addStickyTab([deckTab('1'), deckTab('2')], deckTab('2'), 1);

    expect(next.map(({ key }) => key)).toEqual(['deck:2']);
  });

  it('just appends when the replaced deck has no tab', () => {
    const next = addStickyTab([deckTab('1')], deckTab('3'), 9);

    expect(next.map(({ key }) => key)).toEqual(['deck:1', 'deck:3']);
  });
});

describe('withDeckNames', () => {
  it('titles saved decks from the deck list', () => {
    const tabs = [deckTab('1'), deckTab('2'), detectTransientTab('/decks')!];

    const named = withDeckNames(tabs, new Map([[1, 'Burn']]));

    expect(named.map(({ title }) => title)).toEqual(['Burn', undefined, undefined]);
  });

  it('returns the same list when no title changes', () => {
    const tabs = [{ ...deckTab('1'), title: 'Burn' }];

    expect(withDeckNames(tabs, new Map([[1, 'Burn']]))).toBe(tabs);
    expect(withDeckNames(tabs, new Map())).toBe(tabs);
  });
});

describe('flattenDeckNames', () => {
  const file = (id: number, name: string): ServerInfo_DeckStorage_TreeItem =>
    create(ServerInfo_DeckStorage_TreeItemSchema, { id, name, file: create(ServerInfo_DeckStorage_FileSchema, {}) });

  it('maps every named deck in the tree, folders included', () => {
    const folder = create(ServerInfo_DeckStorage_TreeItemSchema, {
      name: 'Modern', folder: create(ServerInfo_DeckStorage_FolderSchema, { items: [file(2, 'Burn')] }),
    });
    const list = create(Response_DeckListSchema, {
      root: create(ServerInfo_DeckStorage_FolderSchema, { items: [file(1, 'Elves'), folder, file(3, '')] }),
    });

    expect(flattenDeckNames(list)).toEqual(new Map([[1, 'Elves'], [2, 'Burn']]));
  });

  it('is empty before the deck list loads', () => {
    expect(flattenDeckNames(null).size).toBe(0);
  });
});
