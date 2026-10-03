import { act, fireEvent, screen } from '@testing-library/react';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { makeHost, makeKnownHostsHook } from './__mocks__/useKnownHosts';

const { loadPublicServers } = vi.hoisted(() => ({ loadPublicServers: vi.fn() }));

vi.mock('./useKnownHosts');
vi.mock('@app/services', async (orig) => ({
  ...(await orig<typeof import('@app/services')>()),
  loadPublicServers,
}));

import { useKnownHosts } from './useKnownHosts';
import { publicServersStore } from './usePublicServers';
import KnownHosts from './KnownHosts';

const SAVED = makeHost({ id: 1, name: 'Rooster', host: 'server.cockatrice.us/servatrice', port: '4748' });

function setup() {
  const created = makeHost({ id: 7, name: 'Fresh', host: 'fresh.example', port: '443', lastSelected: false });
  const hook = makeKnownHostsHook({ add: vi.fn().mockResolvedValue(created) });
  hook.value = { hosts: [SAVED], selectedHost: SAVED };
  vi.mocked(useKnownHosts).mockReturnValue(hook);
  const onChange = vi.fn();
  const view = renderWithProviders(<KnownHosts value={SAVED} onChange={onChange} />, { preloadedState: connectedState });
  return { ...view, hook, onChange, created };
}

const openPicker = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'KnownHosts.toggle' }));
  });
};

describe('KnownHosts public servers', () => {
  beforeEach(() => {
    publicServersStore.reset();
    loadPublicServers.mockResolvedValue({
      stale: false,
      servers: [
        { name: 'Rooster Ranges', host: 'server.cockatrice.us', port: '4747', websocketPort: '443', isInactive: false },
        { name: 'Fresh', host: 'fresh.example', port: '4747', websocketPort: '443', location: 'USA', isInactive: false },
        { name: 'Desktop Only', host: 'tcp.example', port: '4747', isInactive: false },
        { name: 'Plain WS', host: 'ws.example', port: '4747', websocketPort: '4748', isInactive: false },
        { name: 'Gone', host: 'gone.example', isInactive: true },
      ],
    });
  });

  it('downloads the list only once the picker is opened', async () => {
    setup();
    expect(loadPublicServers).not.toHaveBeenCalled();

    await openPicker();
    expect(loadPublicServers).toHaveBeenCalledTimes(1);
  });

  it('lists new public servers without duplicating saved hosts, disabling the ones a browser cannot reach', async () => {
    setup();
    await openPicker();

    expect(screen.getByRole('button', { name: /Fresh/ })).toBeEnabled();
    const desktopOnly = screen.getByRole('button', { name: /Desktop Only/ });
    expect(desktopOnly).toBeDisabled();
    expect(desktopOnly).toHaveTextContent('KnownHosts.public.unavailable.noWebSocket');
    const plainWs = screen.getByRole('button', { name: /Plain WS/ });
    expect(plainWs).toBeDisabled();
    expect(plainWs).toHaveTextContent('KnownHosts.public.unavailable.noSecureWebSocket');
    expect(screen.queryByRole('button', { name: /Rooster Ranges/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gone/ })).not.toBeInTheDocument();
  });

  it('saves a picked public server as a host and selects it', async () => {
    const { hook, onChange, created } = setup();
    await openPicker();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fresh/ }));
    });

    expect(hook.add).toHaveBeenCalledWith({ name: 'Fresh', host: 'fresh.example/servatrice', port: '443', editable: true });
    expect(hook.select).toHaveBeenCalledWith(created.id);
    expect(onChange).toHaveBeenCalledWith(created);
  });

  it('explains when the list cannot be downloaded', async () => {
    loadPublicServers.mockRejectedValue(new TypeError('Failed to fetch'));
    setup();
    await openPicker();

    expect(screen.getByText('KnownHosts.public.error')).toBeInTheDocument();
  });

  it('re-downloads on refresh', async () => {
    setup();
    await openPicker();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'KnownHosts.public.refresh' }));
    });

    expect(loadPublicServers).toHaveBeenCalledTimes(2);
  });
});
