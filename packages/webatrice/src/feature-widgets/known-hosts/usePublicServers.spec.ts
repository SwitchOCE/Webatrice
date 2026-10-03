import type { PublicServer } from '@app/services';

import { publicServerOptions, toSavedHost } from './usePublicServers';

const server = (overrides: Partial<PublicServer>): PublicServer => ({
  name: 'Server',
  host: 'server.example',
  port: '4747',
  websocketPort: '4748',
  isInactive: false,
  ...overrides,
});

describe('publicServerOptions', () => {
  it('leaves out servers the user already saved, matching by address even when the saved host has a path', () => {
    const options = publicServerOptions(
      [server({ name: 'Rooster', host: 'server.cockatrice.us' }), server({ name: 'New', host: 'new.example' })],
      [{ host: 'Server.Cockatrice.us/servatrice' }],
    );
    expect(options.map((o) => o.server.name)).toEqual(['New']);
  });

  it('drops inactive servers as desktop does', () => {
    expect(publicServerOptions([server({ isInactive: true })], [])).toEqual([]);
  });

  it('marks servers without a WebSocket port as unavailable to the browser', () => {
    const [option] = publicServerOptions([server({ websocketPort: undefined })], []);
    expect(option.unavailableReason).toBe('noWebSocket');
  });

  it('offers WebSocket-capable servers', () => {
    const [option] = publicServerOptions([server({})], []);
    expect(option.unavailableReason).toBeNull();
  });
});

describe('toSavedHost', () => {
  it('saves the server on its WebSocket port as a user-editable host', () => {
    expect(toSavedHost(server({ name: 'New', host: 'new.example', websocketPort: '443' }))).toEqual({
      name: 'New',
      host: 'new.example',
      port: '443',
      editable: true,
    });
  });
});
