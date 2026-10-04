import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BrowserContext, Route } from '@playwright/test';

import { DefaultHosts } from '../../src/utils/HostService';

// Network isolation for every e2e browser context.
//
// The suite talks to exactly two servers, both on this machine: `vite
// preview` (the app) and the docker Servatrice. Everything else the app can
// reach — the public servers in `DefaultHosts`, desktop's public server
// list, Scryfall card data and images, Google Fonts — is either stubbed here
// or refused, so a run never depends on (or leaks traffic to) the internet.
// Without this, the login screen's automatic test-connection against the
// first default host (Chickatrice) made `app-boots` fail whenever that server
// was slow or refused the TLS handshake.
//
// Known external traffic gets a deterministic stand-in: the Scryfall routes
// the app reads (`/cards/named`, `/cards/<id>`), the public server list,
// fonts, and sockets to the known game servers (closed, so they read as
// unreachable). Anything else — another Scryfall endpoint, another host, a
// socket to an unknown server — is aborted and reported by
// `assertNoUnexpectedRequests()`, so a new external dependency fails loudly
// here instead of silently reaching the internet or a stand-in of the wrong
// shape.

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const isExternal = (url: URL): boolean => !LOCAL_HOSTNAMES.has(url.hostname);

// Card-proportioned placeholder (Scryfall's `normal` size is 488×680).
const CARD_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680">' +
  '<rect width="488" height="680" rx="24" fill="#3b3b4f"/>' +
  '<rect x="20" y="20" width="448" height="640" rx="12" fill="none" stroke="#8a8aa3" stroke-width="4"/>' +
  '</svg>';

const SYMBOL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
  '<circle cx="50" cy="50" r="50" fill="#c9c5bd"/>' +
  '</svg>';

// Scryfall card objects for the cards the e2e decks use, trimmed to the
// fields Webatrice reads. They matter beyond pictures: the game board takes a
// card's type line from Scryfall to decide where a double-clicked card lands
// (a land goes to the battlefield, an instant to the stack), so a missing or
// wrong record changes game behaviour, not just art.
type ScryfallFixture = { id: string; name: string; set?: string; collector_number?: string };
const SCRYFALL_CARDS: ScryfallFixture[] = ['forest.json', 'castle-ardenvale.json', 'human-token.json'].map((file) =>
  JSON.parse(readFileSync(resolve(__dirname, 'scryfall', file), 'utf8')),
);

// Scryfall's error shape (https://scryfall.com/docs/api/errors), which the
// app treats as "no data" — the answer for any card without a fixture.
const SCRYFALL_NOT_FOUND = JSON.stringify({
  object: 'error',
  code: 'not_found',
  status: 404,
  details: 'No e2e fixture for this card; add one under e2e/fixtures/scryfall/.',
});

const SCRYFALL_CARD_BY_ID = /^\/cards\/([0-9a-f-]{36})$/;

// The single-card routes the app reads: `/cards/named?exact=<name>` and
// `/cards/<id>`, each with or without `format=image`, plus the batch
// `/cards/collection` POST below. Other endpoints (search, autocomplete)
// answer in other shapes, so they get no stand-in.
const isScryfallCardRoute = (url: URL): boolean =>
  url.pathname === '/cards/named' || SCRYFALL_CARD_BY_ID.test(url.pathname);

function scryfallCardFor(url: URL): { id: string; name: string } | undefined {
  const exact = url.searchParams.get('exact');
  if (url.pathname === '/cards/named' && exact) {
    return SCRYFALL_CARDS.find((card) => card.name.toLowerCase() === exact.toLowerCase());
  }
  const id = url.pathname.match(SCRYFALL_CARD_BY_ID)?.[1];
  return id ? SCRYFALL_CARDS.find((card) => card.id === id) : undefined;
}

// Scryfall's batch lookup (`POST /cards/collection`, used by the card
// catalog's lookupCards): each identifier is a name, an id or a set +
// collector number, answered from the fixtures; the rest are `not_found`.
type CollectionIdentifier = { name?: string; id?: string; set?: string; collector_number?: string };
const SCRYFALL_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function scryfallCollection(postData: string | null): string {
  const { identifiers = [] } = JSON.parse(postData ?? '{}') as { identifiers?: CollectionIdentifier[] };
  const data: ScryfallFixture[] = [];
  const notFound: CollectionIdentifier[] = [];
  for (const wanted of identifiers) {
    const card = SCRYFALL_CARDS.find((c) =>
      (wanted.id != null && c.id === wanted.id) ||
      (wanted.name != null && c.name.toLowerCase() === wanted.name.toLowerCase()) ||
      (wanted.set != null && c.set === wanted.set && c.collector_number === wanted.collector_number));
    if (card) {
      data.push(card);
    } else {
      notFound.push(wanted);
    }
  }
  return JSON.stringify({ object: 'list', not_found: notFound, data });
}

// Desktop's public server list, which the host picker downloads the first
// time it opens (`PUBLIC_SERVERS_URL` in PublicServersService). It covers
// the three kinds of entry the picker handles: reachable, desktop-only (no
// WebSocket port) and inactive. The hosts use the reserved `.invalid` TLD
// and none is named like the `e2e` host the specs pick; connecting to one
// meets the unreachable external socket below.
const PUBLIC_SERVERS_URL = 'https://cockatrice.github.io/public-servers.json';
const PUBLIC_SERVERS = readFileSync(resolve(__dirname, 'public-servers.json'), 'utf8');

// The game servers the app may open a socket to on its own: its built-in
// `DefaultHosts` (the login screen tests the first one) and the public list
// above. A `host` may carry a path (`server.cockatrice.us/servatrice`).
const hostnameOf = (host: string): string => new URL(`wss://${host}`).hostname;
const KNOWN_GAME_SERVERS = new Set([
  ...DefaultHosts.map(({ host }) => hostnameOf(host)),
  ...(JSON.parse(PUBLIC_SERVERS) as { servers: { host: string }[] }).servers.map(({ host }) => hostnameOf(host)),
]);

const SCRYFALL_IMAGE_HOSTS = new Set(['cards.scryfall.io', 'backs.scryfall.io']);

function stubFor(url: URL, method: string, postData: string | null): Parameters<Route['fulfill']>[0] | null {
  if (url.hostname === 'api.scryfall.com' && url.pathname === '/cards/collection') {
    return method === 'OPTIONS'
      ? { status: 204, headers: SCRYFALL_CORS }
      : { status: 200, contentType: 'application/json', headers: SCRYFALL_CORS, body: scryfallCollection(postData) };
  }
  if (url.href === PUBLIC_SERVERS_URL) {
    // GitHub Pages allows any origin; the browser fetches the list cross-origin.
    return {
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: PUBLIC_SERVERS,
    };
  }
  if (url.hostname === 'fonts.googleapis.com') {
    // An empty stylesheet: the app falls back to its system font stack.
    return { status: 200, contentType: 'text/css', body: '' };
  }
  if (url.hostname === 'svgs.scryfall.io') {
    return { status: 200, contentType: 'image/svg+xml', body: SYMBOL_SVG };
  }
  if (SCRYFALL_IMAGE_HOSTS.has(url.hostname)) {
    return { status: 200, contentType: 'image/svg+xml', body: CARD_IMAGE_SVG };
  }
  if (url.hostname === 'api.scryfall.com' && isScryfallCardRoute(url)) {
    // `?format=image` answers with the image itself (via a redirect on the
    // real API); every other endpoint answers with JSON.
    if (url.searchParams.get('format') === 'image') {
      return { status: 200, contentType: 'image/svg+xml', body: CARD_IMAGE_SVG };
    }
    const card = scryfallCardFor(url);
    return card
      ? { status: 200, contentType: 'application/json', body: JSON.stringify(card) }
      : { status: 404, contentType: 'application/json', body: SCRYFALL_NOT_FOUND };
  }
  return null;
}

export interface NetworkIsolation {
  // Throws if the context tried to reach an external host that has no stub.
  assertNoUnexpectedRequests(): void;
}

export async function isolateNetwork(context: BrowserContext): Promise<NetworkIsolation> {
  const unexpected: string[] = [];

  await context.route(isExternal, async (route) => {
    const request = route.request();
    const stub = stubFor(new URL(request.url()), request.method(), request.postData());
    if (stub) {
      await route.fulfill(stub);
      return;
    }
    unexpected.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort('blockedbyclient');
  });

  // Known external game servers behave as unreachable: the socket is closed
  // before Servatrice's identification ever arrives, so the app reports a
  // failed test-connection. A socket to any other external host is reported
  // too. Sockets to the docker Servatrice on localhost are not routed and
  // stay real.
  await context.routeWebSocket(isExternal, (ws) => {
    if (!KNOWN_GAME_SERVERS.has(new URL(ws.url()).hostname)) {
      unexpected.push(`WebSocket ${ws.url()}`);
    }
    ws.close();
  });

  return {
    assertNoUnexpectedRequests() {
      if (unexpected.length > 0) {
        throw new Error(
          'The app made external requests or opened sockets that the e2e suite has no stub for. ' +
          'Add a stub to e2e/fixtures/network.ts rather than letting e2e reach the internet:\n' +
          unexpected.join('\n'),
        );
      }
    },
  };
}
