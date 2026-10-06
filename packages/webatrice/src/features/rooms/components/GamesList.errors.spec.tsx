import { act, fireEvent, screen } from '@testing-library/react';
import { rooms } from '@cockatrice/datatrice';
import { makeRoom } from '@cockatrice/datatrice/testing';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { renderWithProviders, connectedWithRoomsState } from '../../../__test-utils__';
import GamesList from './GamesList';

it('shows translated join codes and transport reasons in the live games list', () => {
  const room = makeRoom();
  const { store } = renderWithProviders(<GamesList room={room} />, { preloadedState: connectedWithRoomsState });
  act(() => store.dispatch(rooms.Actions.setJoinGameError({ code: Response_ResponseCode.RespWrongPassword, message: '' })));
  expect(screen.getByText('JoinGameError.wrongPassword')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
  expect(store.getState().rooms.joinGameError).toBeNull();
  act(() => store.dispatch(rooms.Actions.setJoinGameError({
    code: Response_ResponseCode.RespNotConnected, message: '', failure: WebsocketTypes.CommandFailure.Timeout,
  })));
  expect(screen.getByText('CommandFailure.timeout')).toBeInTheDocument();
});
