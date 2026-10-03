import {
  GAME_LINK_REGEX,
  containsGameLink,
  gameLinkServer,
  isSameServerHost,
  makeGameJoinLink,
  parseGameJoinLink,
} from './gameLink';

describe('makeGameJoinLink', () => {
  it('builds desktop\'s cockatrice://joingame link', () => {
    expect(makeGameJoinLink({ hostname: 'example.com', port: '4748', roomId: 1, gameId: 42, description: '' }))
      .toBe('cockatrice://joingame?hostname=example.com&port=4748&roomid=1&gameid=42');
  });

  it('percent-encodes the description so it survives chat as one word', () => {
    const link = makeGameJoinLink({ hostname: 'h', port: '1', roomId: 2, gameId: 3, description: 'Bo3 & "fun" 100%' });
    expect(link).toBe('cockatrice://joingame?hostname=h&port=1&roomid=2&gameid=3&game=Bo3%20%26%20%22fun%22%20100%25');
    expect(link).not.toMatch(/\s/);
  });
});

describe('parseGameJoinLink', () => {
  it('round-trips a built link', () => {
    const link = { hostname: 'Example.com', port: '4747', roomId: 7, gameId: 99, description: 'Modern, no proxies' };
    expect(parseGameJoinLink(makeGameJoinLink(link))).toEqual({ ok: true, link });
  });

  it('accepts links without a description (older desktop clients)', () => {
    expect(parseGameJoinLink('cockatrice://joingame?hostname=h&port=4747&roomid=1&gameid=5')).toEqual({
      ok: true,
      link: { hostname: 'h', port: '4747', roomId: 1, gameId: 5, description: '' },
    });
  });

  it('is case-insensitive on scheme and host, and keeps "+" literal as QUrl does', () => {
    const parsed = parseGameJoinLink('COCKATRICE://JoinGame?hostname=h&port=1&roomid=1&gameid=1&game=a+b');
    expect(parsed).toEqual({ ok: true, link: expect.objectContaining({ description: 'a+b' }) });
  });

  it.each([
    ['cockatrice://joingame?port=1&roomid=1&gameid=1', 'hostname'],
    ['cockatrice://joingame?hostname=h&roomid=1&gameid=1', 'port'],
    ['cockatrice://joingame?hostname=h&port=99999&roomid=1&gameid=1', 'port'],
    ['cockatrice://joingame?hostname=h&port=1&roomid=x&gameid=1', 'roomId'],
    ['cockatrice://joingame?hostname=h&port=1&roomid=1', 'gameId'],
  ])('reports the first invalid field of %s', (url, error) => {
    expect(parseGameJoinLink(url)).toEqual({ ok: false, error });
  });
});

describe('GAME_LINK_REGEX / containsGameLink', () => {
  const link = 'cockatrice://joingame?hostname=h&port=1&roomid=1&gameid=1';

  it('splits a chat line around each link', () => {
    expect(`Join my game (#1): ${link} now`.split(GAME_LINK_REGEX)).toEqual(['Join my game (#1): ', link, ' now']);
  });

  it('ignores other cockatrice:// actions and look-alike hosts', () => {
    expect(containsGameLink('cockatrice://opendeck?share=x')).toBe(false);
    expect(containsGameLink('cockatrice://joingamefoo?x')).toBe(false);
    expect(containsGameLink(`see ${link}`)).toBe(true);
  });
});

describe('gameLinkServer', () => {
  it('uses the connect target as-is when the host has no path', () => {
    expect(gameLinkServer({ host: 'mtg.example', port: '4748' })).toEqual({ hostname: 'mtg.example', port: '4748' });
  });

  it('strips a path and uses the default port the socket actually dialed', () => {
    expect(gameLinkServer({ host: 'server.example/servatrice', port: '4748' })).toEqual({
      hostname: 'server.example',
      port: '443',
    });
    expect(gameLinkServer({ host: 'localhost/servatrice', port: '4748' })).toEqual({ hostname: 'localhost', port: '80' });
  });

  it('uses the port written before the path, which the socket dials', () => {
    expect(gameLinkServer({ host: 'example.com:8443/servatrice', port: '4748' })).toEqual({
      hostname: 'example.com',
      port: '8443',
    });
    expect(gameLinkServer({ host: '[::1]:4747/servatrice', port: '4748' })).toEqual({ hostname: '[::1]', port: '4747' });
  });
});

describe('isSameServerHost', () => {
  it('compares hostnames case-insensitively', () => {
    expect(isSameServerHost('Server.Example', 'server.example')).toBe(true);
    expect(isSameServerHost('a.example', 'b.example')).toBe(false);
  });
});
