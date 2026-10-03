import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { renderWithProviders, connectedState, makeUser, createMockWebClient } from '../../__test-utils__';
import { ReportChatScope, ReportUserProvider } from '../../dialogs';
import UserDisplay from './UserDisplay';
import { UserMenuSlotProvider, type UserMenuSlotProps } from './UserMenuSlot';

const mockWebClient = createMockWebClient();

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: vi.fn(() => mockWebClient) };
});

vi.mock('@app/images', () => ({
  Images: { Countries: { us: 'us.png', de: 'de.png' } },
}));

describe('UserDisplay', () => {
  it('renders user name', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    expect(screen.getByText('TestPlayer')).toBeInTheDocument();
  });

  it('renders country flag image', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    const img = screen.getByAltText('us');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'us.png');
  });

  it('renders link to player profile', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, {
      preloadedState: connectedState,
    });

    const link = screen.getByRole('link', { name: /TestPlayer/ });
    expect(link).toHaveAttribute('href', '/player/TestPlayer');
  });

  it('renders the context-menu slot with the target and its level', () => {
    const Slot = ({ userName, userLevel, onClose }: UserMenuSlotProps) => (
      <button type="button" role="menuitem" onClick={onClose}>{`slot ${userName} ${userLevel}`}</button>
    );
    const user = makeUser({ name: 'TestPlayer', country: 'us', userLevel: 3 });
    renderWithProviders(
      <UserMenuSlotProvider value={Slot}>
        <UserDisplay user={user} />
      </UserMenuSlotProvider>,
      { preloadedState: connectedState },
    );

    fireEvent.contextMenu(screen.getByText('TestPlayer'));
    const entry = screen.getByRole('menuitem', { name: 'slot TestPlayer 3' });
    fireEvent.click(entry);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the keyboard on the focused name and reaches slot entries with the arrows', async () => {
    const user = userEvent.setup();
    const onSlot = vi.fn();
    const Slot = ({ userName, onClose }: UserMenuSlotProps) => (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          onSlot(userName);
          onClose();
        }}
      >
        Warn user
      </button>
    );
    renderWithProviders(
      <UserMenuSlotProvider value={Slot}>
        <UserDisplay user={makeUser({ name: 'TestPlayer', country: 'us' })} />
      </UserMenuSlotProvider>,
      { preloadedState: connectedState },
    );
    const link = screen.getByRole('link', { name: /TestPlayer/ });
    link.focus();

    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menu', { name: 'UserActionsMenu.label' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /UserActionsMenu.privateChat/ })).toHaveFocus();

    await user.keyboard('{End}{Enter}');
    expect(onSlot).toHaveBeenCalledWith('TestPlayer');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(link).toHaveFocus();
  });

  it('renders only its own entries without a slot provider', () => {
    const user = makeUser({ name: 'TestPlayer', country: 'us' });
    renderWithProviders(<UserDisplay user={user} />, { preloadedState: connectedState });

    fireEvent.contextMenu(screen.getByText('TestPlayer'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^slot/ })).not.toBeInTheDocument();
  });
});

describe('UserDisplay report entry (#7091)', () => {
  function stateOn(version: string) {
    return {
      ...connectedState,
      server: {
        ...(connectedState.server as any),
        info: { message: null, name: 'Test Server', version },
        user: makeUser({ name: 'me', userLevel: Level.IsUser | Level.IsRegistered }),
      },
    };
  }

  function openMenuFor(name: string, version = '3.1.0 ()', chatContext?: () => string) {
    renderWithProviders(
      <ReportUserProvider>
        <ReportChatScope getChatContext={chatContext}>
          <UserDisplay user={makeUser({ name, country: 'us' })} />
        </ReportChatScope>
      </ReportUserProvider>,
      { preloadedState: stateOn(version) },
    );
    fireEvent.contextMenu(screen.getByText(name));
  }

  it('reports another user from the shared menu, attaching the surrounding chat log', () => {
    openMenuFor('TestPlayer', '3.1.0 ()', () => '[12:00:00] TestPlayer: hi');
    fireEvent.click(screen.getByRole('menuitem', { name: 'ReportUserDialog.menuItem' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-reported-user').textContent).toBe('TestPlayer');
    expect((screen.getByLabelText('ReportUserDialog.chatGroup') as HTMLTextAreaElement).value)
      .toBe('[12:00:00] TestPlayer: hi');
  });

  it('lists the entry on your own name but disables it, as desktop does, and says why', () => {
    openMenuFor('me');
    const entry = screen.getByRole('menuitem', { name: 'ReportUserDialog.menuItem' });
    expect(entry).toHaveAttribute('aria-disabled', 'true');
    expect(entry).toHaveAccessibleDescription('ReportUserDialog.menuItemSelf');

    fireEvent.click(entry);
    expect(screen.queryByTestId('report-reported-user')).not.toBeInTheDocument();
  });

  it('offers nothing on a 3.0 server', () => {
    openMenuFor('TestPlayer', '3.0.0 ()');
    expect(screen.queryByRole('menuitem', { name: 'ReportUserDialog.menuItem' })).not.toBeInTheDocument();
  });
});
