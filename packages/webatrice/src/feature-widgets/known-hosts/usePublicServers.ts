import { useSyncExternalStore } from 'react';

import { createSharedStore, LoadingState, type Loadable } from '@app/hooks';
import { isWebSocketReachable, loadPublicServers, type PublicServer, type PublicServerList } from '@app/services';
import type { Host } from '@app/types';

/** One download per session, shared by every host picker (login, register, password reset). */
export const publicServersStore = createSharedStore<PublicServerList>(loadPublicServers);

const IDLE: Loadable<PublicServerList> = { status: LoadingState.LOADING };
const noopSubscribe = () => () => undefined;

/** The address part of a host entry; saved hosts may carry a WebSocket path (`example.org/servatrice`). */
const hostName = (host: string): string => host.split('/')[0].toLowerCase();

export interface PublicServerOption {
  server: PublicServer;
  /** Why the browser can't connect, or null when it can. */
  unavailableReason: 'noWebSocket' | null;
}

/**
 * Public servers the user doesn't already have, as picker options. Entries matching a saved host by
 * address are left out so saved hosts (and their credentials) are never overwritten, and inactive
 * entries are dropped as desktop does.
 */
export function publicServerOptions(servers: PublicServer[], savedHosts: Pick<Host, 'host'>[]): PublicServerOption[] {
  const saved = new Set(savedHosts.map((h) => hostName(h.host)));
  return servers
    .filter((server) => !server.isInactive && !saved.has(hostName(server.host)))
    .map((server) => ({ server, unavailableReason: isWebSocketReachable(server) ? null : 'noWebSocket' }));
}

/** The saved-host record a picked public server becomes; it connects on its WebSocket port. */
export const toSavedHost = ({ name, host, websocketPort }: PublicServer): Host => ({
  name,
  host,
  port: websocketPort ?? '',
  editable: true,
});

/** Re-downloads the list (the picker's refresh button). */
export function refreshPublicServers(): void {
  publicServersStore.reset();
  publicServersStore.whenReady().catch(() => undefined);
}

/**
 * Subscribes to the public list only while `enabled` (the picker is open), so the download happens the
 * first time someone looks for a server rather than on every page that renders a picker.
 */
export function usePublicServers(enabled: boolean): Loadable<PublicServerList> {
  return useSyncExternalStore(
    enabled ? publicServersStore.subscribe : noopSubscribe,
    enabled ? publicServersStore.getSnapshot : () => IDLE,
  );
}
