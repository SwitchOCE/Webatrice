import { act, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { disconnectedState, renderWithProviders } from '../../../__test-utils__';
import { DeckShareLinkRedirect } from './DeckShareLinkRedirect';

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe('DeckShareLinkRedirect', () => {
  const original = window.location.href;
  afterEach(() => {
    window.history.replaceState(null, '', original);
    window.sessionStorage.clear();
  });

  it('takes the link from the page address and opens it after login', () => {
    window.history.replaceState(null, '', '/?share=tok&hostname=server.example&port=4748');
    const { store } = renderWithProviders(<><DeckShareLinkRedirect /><Location /></>, { preloadedState: disconnectedState });
    expect(window.location.search).toBe('');
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    act(() => {
      store.dispatch(server.Actions.updateStatus({ status: { state: WebsocketTypes.StatusEnum.LOGGED_IN, description: null } }));
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/decks/shared?share=tok&hostname=server.example&port=4748');
  });

  it('does nothing without a link', () => {
    window.history.replaceState(null, '', '/');
    const { store } = renderWithProviders(<><DeckShareLinkRedirect /><Location /></>, { preloadedState: disconnectedState });
    act(() => {
      store.dispatch(server.Actions.updateStatus({ status: { state: WebsocketTypes.StatusEnum.LOGGED_IN, description: null } }));
    });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
