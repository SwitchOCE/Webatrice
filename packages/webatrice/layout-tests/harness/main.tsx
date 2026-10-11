import '../../src/polyfills';

import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { StyledEngineProvider } from '@mui/material/styles';

import { DatatriceProvider, WebClientProvider } from '@cockatrice/datatrice/react';
import { makeUser } from '@cockatrice/datatrice/testing';
import { extensions } from '@app/store';
import { AppThemeProvider } from '@app/components';
import { currentMaxExpandedChats, dispatchChatDock } from '@app/hooks';
import { CLIENT_CONFIG, CLIENT_OPTIONS } from '../../src/clientConfig';
import AppShell from '../../src/AppShell';
import { connected31State } from '../../src/__test-utils__/storeFixtures';
import { buildLayoutGame } from './fixture';

import '../../src/i18n';
import '../../src/index.css';

const query = new URLSearchParams(window.location.search);
const players = Number(query.get('players') ?? 4);
const spectator = query.get('as') === 'spectator';
const chatPeers = ['mainman879', 'Bobby4261789', 'Jsiggy54', 'GolbogDoomslay'];

window.localStorage.setItem('webatrice.lastRoute', query.get('route') === 'home' ? '/' : '/game/1');

const game = buildLayoutGame({ players, spectator });
const self = makeUser({ name: spectator ? 'AzureJay' : 'Alex' });
const seated = Object.values(game.players).map((p) => p.properties.userInfo!);
const users = Object.fromEntries(
  [self, ...chatPeers.map((name) => makeUser({ name })), ...seated].map((u) => [u.name, u]),
);
const base = connected31State as Record<string, Record<string, unknown>>;
const state = {
  ...base,
  server: { ...base.server, user: self, users: { ...(base.server.users as object), ...users } },
  rooms: { ...base.rooms, joinedGameIds: { 1: { 1: true } } },
  games: { ...base.games, games: { 1: game } },
};

const keepSession = () => (next: (a: unknown) => unknown) => (a: { type?: string }) =>
  (a.type === 'server/initialized' ? a : next(a));

declare global {
  interface Window {
    layoutHarness: { openChats: (open: number, minimised?: number) => void };
  }
}
window.layoutHarness = {
  openChats: (open, minimised = 0) => {
    const names = chatPeers.slice(0, open + minimised);
    names.forEach((name) => dispatchChatDock({ type: 'open', name, max: currentMaxExpandedChats() }));
    names.slice(0, minimised).forEach((name) => dispatchChatDock({ type: 'minimise', name }));
  },
};

createRoot(document.getElementById('root')!).render(
  <DatatriceProvider extensions={extensions} preloadedState={state as never} additionalMiddleware={[keepSession as never]}>
    <WebClientProvider config={CLIENT_CONFIG} options={CLIENT_OPTIONS}>
      <StyledEngineProvider injectFirst>
        <AppThemeProvider>
          <Suspense fallback="loading">
            <AppShell />
          </Suspense>
        </AppThemeProvider>
      </StyledEngineProvider>
    </WebClientProvider>
  </DatatriceProvider>,
);
