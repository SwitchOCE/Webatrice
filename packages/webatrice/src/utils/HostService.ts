import { Host } from '@app/types';
export const DefaultHosts: Host[] = [
  {
    name: 'Chickatrice',
    host: 'mtg.chickatrice.net',
    port: '443',
    editable: false,
  },
  {
    name: 'Rooster',
    host: 'server.cockatrice.us/servatrice',
    port: '4748',
    editable: false,
  },
  {
    name: 'Rooster Beta',
    host: 'beta.cockatrice.us/servatrice',
    port: '4748',
    editable: false,
  },
  {
    name: 'Tetrarch',
    host: 'mtg.tetrarch.co/servatrice',
    port: '443',
    editable: false,
  },
];

export const getHostPort = (host: Host): { host: string, port: string } => {
  if (!host) {
    return {
      host: '',
      port: ''
    };
  }

  return {
    host: host.host,
    port: host.port,
  };
};

/**
 * One string naming a server by address, as desktop's startup server is saved (host and port):
 * a host's id does not survive deleting and re-adding it, its address does.
 */
export const getHostKey = (host: Host): string => {
  const { host: address, port } = getHostPort(host);
  return `${address}:${port}`;
};
