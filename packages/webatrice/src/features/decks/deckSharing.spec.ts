import {
  buildDeckShareLink,
  captureDeckShareLink,
  deckColorIdentity,
  deckShareQuery,
  formatShareExpiry,
  isSameShareServer,
  parseDeckShareLink,
  parseDeckShareQuery,
  takePendingDeckShareLink,
} from './deckSharing';
import type { DeckCard } from './types';

const link = { token: 'abc123', hostname: 'server.cockatrice.us', port: '4748' };

describe('share links', () => {
  it('builds a link to Webatrice itself with desktop\'s parameters in the fragment', () => {
    const built = buildDeckShareLink('https://play.example/webatrice/?old=1#x', link);
    expect(built).toBe('https://play.example/webatrice/#share=abc123&hostname=server.cockatrice.us&port=4748');
    expect(new URL(built).search).toBe('');
    expect(parseDeckShareLink(built)).toEqual(link);
  });

  it('still reads a pasted link with the parameters in the query', () => {
    expect(parseDeckShareLink('https://play.example/?share=abc123&hostname=server.cockatrice.us&port=4748')).toEqual(link);
  });

  it('reads encoded values and ignores extra parameters', () => {
    expect(parseDeckShareLink('https://x/#share=a%2Fb%3D&hostname=h&port=1&evil=%2F%2Fother')).toEqual({
      token: 'a/b=',
      hostname: 'h',
      port: '1',
    });
  });

  it('reads a desktop cockatrice://opendeck link', () => {
    expect(parseDeckShareLink('cockatrice://opendeck?share=abc123&hostname=server.cockatrice.us&port=4747')).toEqual({
      ...link,
      port: '4747',
    });
  });

  it.each([
    ['not a link', 'invalid'],
    ['cockatrice://joingame?share=a&hostname=h&port=1', 'invalid'],
    ['javascript:alert(1)//?share=a&hostname=h&port=1', 'invalid'],
    ['data:text/html,x?share=a&hostname=h&port=1', 'invalid'],
    ['https://x/?share=a&port=1', 'hostname'],
    ['https://x/?share=a&hostname=h', 'port'],
    ['https://x/?share=a&hostname=h&port=0', 'port'],
    ['https://x/?share=a&hostname=h&port=70000', 'port'],
    ['https://x/?share=a&hostname=h&port=4x', 'port'],
    ['https://x/?share=&hostname=h&port=1', 'share'],
  ])('rejects %s (%s)', (text, problem) => {
    expect(parseDeckShareLink(text)).toEqual({ problem });
  });

  it('round-trips the route query', () => {
    expect(parseDeckShareQuery(new URLSearchParams(deckShareQuery(link)))).toEqual(link);
  });

  it('matches the server by host name only, ignoring case', () => {
    expect(isSameShareServer(link, 'Server.Cockatrice.US')).toBe(true);
    expect(isSameShareServer({ ...link, port: '4747' }, 'server.cockatrice.us')).toBe(true);
    expect(isSameShareServer(link, 'other.host')).toBe(false);
    expect(isSameShareServer(link, undefined)).toBe(false);
  });

  it('matches a desktop link against a host with a WebSocket path, scheme or port', () => {
    expect(isSameShareServer(link, 'server.cockatrice.us/servatrice')).toBe(true);
    expect(isSameShareServer(link, 'wss://server.cockatrice.us:4748/servatrice')).toBe(true);
    expect(isSameShareServer({ ...link, hostname: 'server.cockatrice.us/servatrice' }, 'server.cockatrice.us')).toBe(true);
    expect(isSameShareServer(link, 'cockatrice.us')).toBe(false);
  });
});

describe('formatShareExpiry', () => {
  it('formats Unix seconds, from a bigint too', () => {
    const seconds = Date.UTC(2026, 9, 3, 12, 0) / 1000;
    expect(formatShareExpiry(BigInt(seconds), 'en-US')).toBe(formatShareExpiry(seconds, 'en-US'));
    expect(formatShareExpiry(seconds, 'en-US')).toMatch(/10\/3\/26|10\/4\/26/);
  });
});

describe('deckColorIdentity', () => {
  const card = (category: DeckCard['category'], colors?: string[]): DeckCard =>
    ({ name: 'x', quantity: 1, category, colors, lookupSource: 'dexie' });

  it('collects main and side colors in WUBRG order', () => {
    expect(deckColorIdentity([card('main', ['G', 'U']), card('sideboard', ['W']), card('main')])).toBe('WUG');
  });

  it('is empty for colorless decks', () => {
    expect(deckColorIdentity([card('main', [])])).toBe('');
  });
});

describe('pending share link', () => {
  function fakeWindow(hash: string, search = '') {
    const replaceState = vi.fn();
    const win = {
      location: { search, pathname: '/app/', hash },
      history: { state: null, replaceState },
    } as unknown as Window;
    return { win, replaceState };
  }

  afterEach(() => {
    takePendingDeckShareLink();
  });

  it('moves the link from the fragment into memory once', () => {
    const { win, replaceState } = fakeWindow('#share=abc123&hostname=h&port=4748', '?lang=fr');
    expect(captureDeckShareLink(win)).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app/?lang=fr');
    expect(takePendingDeckShareLink()).toBe('share=abc123&hostname=h&port=4748');
    expect(takePendingDeckShareLink()).toBeNull();
  });

  it('keeps other fragment parameters in the address bar', () => {
    const { win, replaceState } = fakeWindow('#tab=x&share=abc123&hostname=h&port=4748');
    expect(captureDeckShareLink(win)).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app/#tab=x');
  });

  it('keeps an incomplete link so the shared-deck page can say what is missing', () => {
    const { win } = fakeWindow('#share=abc123');
    expect(captureDeckShareLink(win)).toBe(true);
    expect(parseDeckShareQuery(new URLSearchParams(takePendingDeckShareLink()!))).toEqual({ problem: 'hostname' });
  });

  it('ignores a share link in the query: only the fragment form is opened on load', () => {
    const { win, replaceState } = fakeWindow('', '?share=abc123&hostname=h&port=4748');
    expect(captureDeckShareLink(win)).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
    expect(takePendingDeckShareLink()).toBeNull();
  });

  it('ignores a page load without a share link', () => {
    const { win, replaceState } = fakeWindow('#tab=x', '?lang=fr');
    expect(captureDeckShareLink(win)).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
