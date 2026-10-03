import { z } from 'zod';

/**
 * The public server list desktop Cockatrice downloads (`handle_public_servers.cpp` PUBLIC_SERVERS_JSON).
 * GitHub Pages serves it with `Access-Control-Allow-Origin: *`, so the browser fetches it directly.
 */
export const PUBLIC_SERVERS_URL = 'https://cockatrice.github.io/public-servers.json';

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_KEY = 'webatrice.publicServers';

export interface PublicServer {
  name: string;
  host: string;
  /** Raw TCP port: desktop only. */
  port?: string;
  /** Present only for servers a browser can reach. */
  websocketPort?: string;
  site?: string;
  location?: string;
  /** Desktop drops inactive entries from its saved list. */
  isInactive: boolean;
}

export interface PublicServerList {
  servers: PublicServer[];
  /** True when the download failed and these are the last list that did download. */
  stale: boolean;
}

const portSchema = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String);

const entrySchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: portSchema.optional(),
  websocketPort: portSchema.optional(),
  site: z.string().optional(),
  location: z.string().optional(),
  isInactive: z.boolean().optional().default(false),
});

const documentSchema = z.object({ servers: z.array(z.unknown()) });

/**
 * Parses the public list document. A document without a `servers` array is rejected; individual
 * malformed entries are skipped so one bad row doesn't hide the rest (desktop reads entries leniently).
 */
export function parsePublicServers(json: unknown): PublicServer[] {
  const { servers } = documentSchema.parse(json);
  return servers.flatMap((entry) => {
    const parsed = entrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Desktop dials a public server's WebSocket port as `ws://host:port/servatrice`, using `wss` only on
 * port 443 (`RemoteClient::connectToHost`). A page served over https may only open `wss`, so the
 * browser can reach a public server only through its port 443 listener.
 */
export const SECURE_WEBSOCKET_PORT = '443';

/** True when a browser can connect: the server is still active and publishes a secure WebSocket port. */
export const isWebSocketReachable = (server: PublicServer): boolean =>
  !server.isInactive && server.websocketPort === SECURE_WEBSOCKET_PORT;

function readCache(): PublicServer[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? parsePublicServers(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(servers: PublicServer[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ servers }));
  } catch {
    // Storage full or blocked: the cache is a convenience, not a requirement.
  }
}

export async function fetchPublicServers(timeoutMs = FETCH_TIMEOUT_MS): Promise<PublicServer[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(PUBLIC_SERVERS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Public server list request failed: ${response.status}`);
    }
    return parsePublicServers(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads the public list, falling back to the last successful download when offline, timed out or
 * served a malformed document. Rejects only when there is nothing to fall back to.
 */
export async function loadPublicServers(): Promise<PublicServerList> {
  try {
    const servers = await fetchPublicServers();
    writeCache(servers);
    return { servers, stale: false };
  } catch (error) {
    const cached = readCache();
    if (cached) {
      return { servers: cached, stale: true };
    }
    throw error;
  }
}
