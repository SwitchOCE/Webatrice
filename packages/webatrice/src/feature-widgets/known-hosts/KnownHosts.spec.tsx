import { act, fireEvent, screen, within } from '@testing-library/react';

import { server } from '@cockatrice/datatrice';

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

describe('KnownHosts keyboard and screen-reader access', () => {
  beforeEach(() => {
    publicServersStore.reset();
    loadPublicServers.mockResolvedValue({ stale: false, servers: [] });
  });

  it('exposes the open state on the toggles', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'KnownHosts.toggle' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await openPicker();

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'KnownHosts.label' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists saved hosts as options, marking the selected one', async () => {
    setup();
    await openPicker();

    const listbox = screen.getByRole('listbox', { name: 'KnownHosts.saved' });
    const [option] = within(listbox).getAllByRole('option');
    expect(option).toHaveTextContent('Rooster');
    expect(option).toHaveAttribute('aria-selected', 'true');
  });

  it('picks a host from the keyboard and returns focus to the picker', async () => {
    const { hook } = setup();
    await openPicker();

    const option = screen.getByRole('option', { name: /Rooster/ });
    option.focus();
    await act(async () => {
      fireEvent.click(option);
    });

    expect(hook.select).toHaveBeenCalledWith(SAVED.id);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KnownHosts.label' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the picker', async () => {
    setup();
    await openPicker();

    screen.getByRole('option', { name: /Rooster/ }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KnownHosts.label' })).toHaveFocus();
  });

  it('names each Edit button after its host', async () => {
    const hook = makeKnownHostsHook();
    const editable = makeHost({ id: 3, name: 'Mine', editable: true });
    hook.value = { hosts: [editable], selectedHost: editable };
    vi.mocked(useKnownHosts).mockReturnValue(hook);
    renderWithProviders(<KnownHosts value={editable} onChange={vi.fn()} />, { preloadedState: connectedState });
    await openPicker();

    expect(screen.getByRole('button', { name: 'KnownHosts.edit' })).toBeInTheDocument();
  });

  it('announces the connection test result in a status region', () => {
    const { store } = setup();
    // Selecting a host on mount starts a connection test.
    expect(screen.getByText('KnownHosts.status.testing')).toHaveAttribute('role', 'status');

    act(() => {
      store.dispatch(server.Actions.testConnectionFailed());
    });

    expect(screen.getByText('KnownHosts.status.failed')).toHaveAttribute('role', 'status');
  });
});
