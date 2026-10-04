import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { PREFERENCE_DEFAULTS, RouteEnum, StartupTab, type PreferenceKey, type Preferences } from '@app/types';

const hoisted = vi.hoisted(() => ({
  preferences: {} as Partial<Preferences>,
  useKnownHosts: vi.fn(),
}));

vi.mock('@app/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/hooks')>()),
  usePreference: (key: PreferenceKey) => hoisted.preferences[key] ?? PREFERENCE_DEFAULTS[key],
}));
vi.mock('@app/feature-widgets/known-hosts', () => ({ useKnownHosts: hoisted.useKnownHosts }));

import { makeHost, makeKnownHostsHook } from '../../feature-widgets/known-hosts/__mocks__/useKnownHosts';
import { pageLoadLoginGate, resolveStartupDestination, useStartupDestination } from './startupDestination';

const prefs = (overrides: Partial<Preferences> = {}) => ({
  startupTab: PREFERENCE_DEFAULTS.startupTab,
  startupServer: '',
  startupRoom: '',
  ...overrides,
});

describe('resolveStartupDestination', () => {
  it('returns to the page a reload started on', () => {
    expect(resolveStartupDestination(prefs({ startupTab: StartupTab.Replays }), 'a:1', '/decks'))
      .toEqual({ to: '/decks' });
  });

  it('opens the lobby by default, as Webatrice always has', () => {
    expect(resolveStartupDestination(prefs(), 'a:1', undefined)).toEqual({ to: RouteEnum.SERVER });
  });

  it.each([
    [StartupTab.DeckStorage, RouteEnum.DECKS],
    [StartupTab.Replays, RouteEnum.REPLAYS],
    [StartupTab.Server, RouteEnum.SERVER],
  ])('opens the %s startup tab', (startupTab, to) => {
    expect(resolveStartupDestination(prefs({ startupTab }), 'a:1', undefined)).toEqual({ to });
  });

  it('hands the startup room to the lobby on any server when none is chosen', () => {
    expect(resolveStartupDestination(prefs({ startupTab: StartupTab.ServerRoom, startupRoom: 'Magic' }), 'a:1', undefined))
      .toEqual({ to: RouteEnum.SERVER, state: { startupRoom: 'Magic' } });
  });

  it('hands the startup room to the lobby on the startup server', () => {
    const preferences = prefs({ startupTab: StartupTab.ServerRoom, startupServer: 'a:1', startupRoom: 'Magic' });
    expect(resolveStartupDestination(preferences, 'a:1', undefined))
      .toEqual({ to: RouteEnum.SERVER, state: { startupRoom: 'Magic' } });
  });

  it('opens the lobby of any other server', () => {
    const preferences = prefs({ startupTab: StartupTab.ServerRoom, startupServer: 'a:1', startupRoom: 'Magic' });
    expect(resolveStartupDestination(preferences, 'b:2', undefined)).toEqual({ to: RouteEnum.SERVER });
  });

  it('opens the lobby when no room is named', () => {
    expect(resolveStartupDestination(prefs({ startupTab: StartupTab.ServerRoom }), 'a:1', undefined))
      .toEqual({ to: RouteEnum.SERVER });
  });
});

function LoginPage({ connected }: { connected: boolean }) {
  const destination = useStartupDestination(connected);
  return connected ? <Navigate to={destination.to} state={destination.state} /> : <div>login-page</div>;
}

function Landing() {
  const location = useLocation();
  return <div>{`at ${location.pathname} ${JSON.stringify(location.state)}`}</div>;
}

function renderLogin(connected: boolean, from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: RouteEnum.LOGIN, state: from ? { from } : null }]}>
      <Routes>
        <Route path={RouteEnum.LOGIN} element={<LoginPage connected={connected} />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useStartupDestination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageLoadLoginGate.done = false;
    hoisted.preferences = {};
    const host = makeHost({ host: 'a', port: '1' });
    hoisted.useKnownHosts.mockReturnValue(makeKnownHostsHook({ value: { hosts: [host], selectedHost: host } }));
  });

  it('returns the first login of a page load to the page it was sent away from', () => {
    hoisted.preferences = { startupTab: StartupTab.Replays };

    renderLogin(true, '/decks');

    expect(screen.getByText('at /decks null')).toBeInTheDocument();
    expect(pageLoadLoginGate.done).toBe(true);
  });

  it('sends a later login to the startup tab, wherever the user was sent from', () => {
    hoisted.preferences = { startupTab: StartupTab.Replays };
    pageLoadLoginGate.done = true;

    renderLogin(true, '/decks');

    expect(screen.getByText('at /replays null')).toBeInTheDocument();
  });

  it('sends a login that started on the login page to the startup tab', () => {
    hoisted.preferences = { startupTab: StartupTab.DeckStorage };

    renderLogin(true);

    expect(screen.getByText('at /decks null')).toBeInTheDocument();
  });

  it('matches the startup server against the host being signed in to', () => {
    hoisted.preferences = { startupTab: StartupTab.ServerRoom, startupServer: 'a:1', startupRoom: 'Magic' };

    renderLogin(true);

    expect(screen.getByText('at /server {"startupRoom":"Magic"}')).toBeInTheDocument();
  });

  it('keeps the page-load login pending while the login page waits', () => {
    act(() => {
      renderLogin(false, '/decks');
    });

    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(pageLoadLoginGate.done).toBe(false);
  });

  it('keeps the destination it decided when the login page re-renders', () => {
    hoisted.preferences = { startupTab: StartupTab.Replays };
    const { rerender } = renderLogin(true, '/decks');
    expect(screen.getByText('at /decks null')).toBeInTheDocument();

    // The first post-login events (user info, rooms) re-render the login page; the gate has
    // latched by then, and a recomputed destination would navigate a second time.
    rerender(
      <MemoryRouter initialEntries={[{ pathname: RouteEnum.LOGIN, state: { from: '/decks' } }]}>
        <Routes>
          <Route path={RouteEnum.LOGIN} element={<LoginPage connected />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('at /decks null')).toBeInTheDocument();
  });
});
