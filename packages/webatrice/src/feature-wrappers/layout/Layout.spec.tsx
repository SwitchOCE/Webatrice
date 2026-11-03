import { act, fireEvent, screen, within } from '@testing-library/react';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { RouteEnum } from '@app/types';

import Layout from './Layout';

describe('Layout', () => {
  afterEach(() => {
    act(() => {
      fireEvent.click(screen.queryByRole('button', { name: 'NavRail.toggle.show' }) ?? document.body);
    });
    window.localStorage.clear();
  });

  it('puts the rail beside the session strip and the page', () => {
    renderWithProviders(<Layout><p>Page</p></Layout>, { preloadedState: connectedState, route: RouteEnum.SERVER });

    expect(screen.getByRole('navigation', { name: 'NavRail.label' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'TopBar.tabs.label' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Page');
  });

  it('hides the rail from the toggle in the top bar and brings it back', () => {
    renderWithProviders(<Layout><p>Page</p></Layout>, { preloadedState: connectedState, route: RouteEnum.SERVER });

    const toggle = within(screen.getByRole('banner')).getByRole('button', { name: 'NavRail.toggle.hide' });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.queryByRole('navigation', { name: 'NavRail.label' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Page');
    const show = within(screen.getByRole('banner')).getByRole('button', { name: 'NavRail.toggle.show' });
    expect(show).toHaveFocus();
    expect(window.localStorage.getItem('webatrice.navRailHidden')).toBe('true');

    fireEvent.click(show);
    expect(screen.getByRole('navigation', { name: 'NavRail.label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NavRail.toggle.hide' })).toHaveFocus();
  });

  it('shows neither rail nor strip without the nav', () => {
    renderWithProviders(<Layout showNav={false}><p>Login</p></Layout>, { preloadedState: connectedState, route: RouteEnum.LOGIN });

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Login');
  });
});
