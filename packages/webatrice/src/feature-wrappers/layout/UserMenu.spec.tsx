import { fireEvent, screen } from '@testing-library/react';

import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { connectedState, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';

import UserMenu, { type UserMenuProps } from './UserMenu';
import { UserMenuDialog } from './userMenuEntries';

function renderMenu(overrides: Partial<UserMenuProps> = {}) {
  const props: UserMenuProps = {
    userName: 'testUser',
    userLevel: Level.IsUser | Level.IsRegistered,
    snapGridVisible: false,
    onToggleSnapGrid: vi.fn(),
    phaseTrackPinned: true,
    onTogglePhaseTrackPinned: vi.fn(),
    onNavigate: vi.fn(),
    onOpenDialog: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<UserMenu {...props} />, { preloadedState: connectedState });
  return props;
}

const trigger = () => screen.getByRole('button', { name: 'testUser' });

describe('UserMenu', () => {
  it('opens a menu labelled with the user from its button', () => {
    renderMenu();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'testUser' })).toBeInTheDocument();
  });

  it('opens with ArrowDown, as a menu button does', () => {
    renderMenu();

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('falls back to a generic label before the user is known', () => {
    renderMenu({ userName: null });

    expect(screen.getByRole('button', { name: 'TopBar.user.signedIn' })).toBeInTheDocument();
  });

  it('shows the board toggles, auto-hide as the inverse of the pinned phase track', () => {
    const props = renderMenu({ snapGridVisible: true, phaseTrackPinned: true });
    fireEvent.click(trigger());

    expect(screen.getByRole('menuitemcheckbox', { name: 'TopBar.game.snapGrid' })).toHaveAttribute('aria-checked', 'true');
    const autoHide = screen.getByRole('menuitemcheckbox', { name: 'TopBar.game.phaseTrackToggle' });
    expect(autoHide).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(autoHide);

    expect(props.onTogglePhaseTrackPinned).toHaveBeenCalledTimes(1);
  });

  it('navigates to a route entry and closes', () => {
    const props = renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole('menuitem', { name: 'UserMenu.settings' }));

    expect(props.onNavigate).toHaveBeenCalledWith(RouteEnum.SETTINGS);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a dialog entry in place', () => {
    const props = renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole('menuitem', { name: 'UserMenu.debugLog' }));

    expect(props.onOpenDialog).toHaveBeenCalledWith(UserMenuDialog.DebugLog);
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('lists staff entries only for staff', () => {
    renderMenu({ userLevel: Level.IsUser | Level.IsRegistered | Level.IsModerator });
    fireEvent.click(trigger());

    expect(screen.getByRole('menuitem', { name: 'UserMenu.administration' })).toBeInTheDocument();
  });

  it('signs out last', () => {
    const props = renderMenu();
    fireEvent.click(trigger());
    const items = screen.getAllByRole('menuitem');

    fireEvent.click(items[items.length - 1]);

    expect(items[items.length - 1]).toHaveTextContent('TopBar.user.signOut');
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});
