// Design preview entry (not shipped). ?layout=classic|table&n=2..6
import '../polyfills';

import { createRoot } from 'react-dom/client';
import { StyledEngineProvider } from '@mui/material';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

import { DatatriceProvider, WebClientProvider } from '@cockatrice/datatrice/react';
import { extensions } from '@app/store';
import { ToastProvider } from '@app/components';
import { ShortcutProvider } from '@app/feature-widgets/shortcuts';
import { Game } from '@app/features/game';
import { CLIENT_CONFIG, CLIENT_OPTIONS } from '../clientConfig';
import { buildPreview } from './fixture';
import TableGame from './table/TableGame';

import '../i18n';
import '../index.css';
import '../AppShell.css';

function LocLog() {
  const l = useLocation(); useEffect(() => {
    if (q.get('debug')) {
      console.log('LOCATION', l.pathname, JSON.stringify(l.state));
    }
  }, [l]); return null;
}
const q = new URLSearchParams(window.location.search);
const n = Math.min(6, Math.max(2, Number(q.get('n') ?? 4)));
const layout = q.get('layout') === 'table' ? 'table' : 'classic';
const { state, extras } = buildPreview(n, q.get('stress') === '1');
const logActions = () => (next: (a: unknown) => unknown) => (a: { type?: string }) => {
  if (q.get('debug')) {
    console.log('ACTION', a.type);
  }
  // The preview has no server: keep the seeded logged-in session instead of the startup reset.
  if (a.type === 'server/initialized') {
    return a;
  }
  return next(a);
};

createRoot(document.getElementById('root')!).render(
  <DatatriceProvider extensions={extensions} preloadedState={state as never} additionalMiddleware={[logActions as never]}>
    <WebClientProvider config={CLIENT_CONFIG} options={CLIENT_OPTIONS}>
      <StyledEngineProvider injectFirst>
        <ToastProvider>
          <div className="AppShell">
            <MemoryRouter initialEntries={['/game/1']}>
              <ShortcutProvider>
                <LocLog />
                <div className="AppShell-routes">
                  <Routes>
                    <Route path="/game/:gameId" element={layout === 'table' ? <TableGame extras={extras} /> : <Game />} />
                    <Route path="*" element={<div style={{ color: '#fff', padding: 24 }}>left the game route</div>} />
                  </Routes>
                </div>
              </ShortcutProvider>
            </MemoryRouter>
          </div>
        </ToastProvider>
      </StyledEngineProvider>
    </WebClientProvider>
  </DatatriceProvider>,
);
