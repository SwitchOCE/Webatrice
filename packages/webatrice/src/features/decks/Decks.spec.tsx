import { act, fireEvent, screen } from '@testing-library/react';
import { server } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connectedState, disconnectedState } from '../../__test-utils__';
import Decks from './Decks';

// Piece 2 coverage: smoke-test the new MyDecks list. Full RTL
// coverage (create/delete flows, useReduxEffect navigation) lives in
// integration tests to be added alongside Piece 3.
describe('Decks (MyDecks page)', () => {
  it('renders the page header + New Deck button when connected', () => {
    renderWithProviders(<Decks />, { preloadedState: connectedState });
    expect(screen.getByRole('heading', { name: 'My Decks' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new deck/i }).length).toBeGreaterThan(0);
  });

  it('shows the loading state while backendDecks is null', () => {
    renderWithProviders(<Decks />, { preloadedState: connectedState });
    expect(screen.getByText(/loading decks/i)).toBeInTheDocument();
  });

  it('replaces the spinner with the failure reason when the deck list fails', () => {
    const { store } = renderWithProviders(<Decks />, { preloadedState: connectedState });
    act(() => {
      store.dispatch(server.Actions.deckListFailed({
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });
    expect(screen.queryByText(/loading decks/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('CommandFailure.timeout');
  });

  it('shows the generic list error for a server rejection, and Retry re-requests the list', () => {
    const { store, webClient } = renderWithProviders(<Decks />, { preloadedState: connectedState });
    vi.mocked(webClient.request.session.deckList).mockClear();
    act(() => {
      store.dispatch(server.Actions.deckListFailed({ responseCode: Response_ResponseCode.RespInternalError }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Decks.listError');

    fireEvent.click(screen.getByRole('button', { name: /Decks.retry/ }));
    expect(webClient.request.session.deckList).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/loading decks/i)).toBeInTheDocument();
  });

  it('still renders the page shell when disconnected (AuthGuard does not blank the page)', () => {
    renderWithProviders(<Decks />, { preloadedState: disconnectedState });
    expect(screen.getByRole('heading', { name: 'My Decks' })).toBeInTheDocument();
  });
});
