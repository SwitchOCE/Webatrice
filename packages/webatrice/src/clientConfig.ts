import { SOCKATRICE_FEATURES } from '@cockatrice/sockatrice';

import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

const APP_FEATURES = [
  '2.7.0_min_version',
  '2.8.0_min_version',
] as const;

/**
 * Sent as Command_Login.clientver. Desktop sends its VERSION_STRING,
 * "<version> (<commit date>)" (remote_client.cpp generateCommandLogin); this is
 * the same shape built from Webatrice's package version and last commit date.
 * The `webatrice-` prefix keeps web sessions distinguishable from desktop
 * clients in Servatrice's session records, since the version lines overlap.
 */
export function formatClientVersion(version: string, buildDate: string): string {
  return `webatrice-${version} (${buildDate})`;
}

export const CLIENT_VERSION = formatClientVersion(__WEBATRICE_VERSION__, __WEBATRICE_BUILD_DATE__);

export const CLIENT_CONFIG: WebsocketTypes.ClientConfig = {
  clientid: 'webatrice',
  clientver: CLIENT_VERSION,
  clientfeatures: [...SOCKATRICE_FEATURES, ...APP_FEATURES],
};

export const CLIENT_OPTIONS: WebsocketTypes.ClientOptions = {
  autojoinrooms: true,
  keepalive: 5000,
};
