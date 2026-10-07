import { act, fireEvent, screen } from '@testing-library/react';
import { rooms } from '@cockatrice/datatrice';
import { makeGame, makeRoom, makeRoomsState } from '@cockatrice/datatrice/testing';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { renderWithProviders, connectedWithRoomsState } from '../../../__test-utils__';
import GamesList from './GamesList';

it('shows translated join codes and transport reasons in the live games list', async () => {
  const room = makeRoom({ games: { 1: makeGame({ playerCount: 1, maxPlayers: 2 }) } });
  const { store, webClient } = renderWithProviders(<GamesList room={room} />, { preloadedState: {
    ...connectedWithRoomsState, rooms: makeRoomsState({ rooms: { 1: room }, selectedGameIds: { 1: 1 } }),
  } });
  fireEvent.click(await screen.findByRole('button', { name: /^Join$/ }));
  const requestId = vi.mocked(webClient.request.rooms.joinGame).mock.lastCall?.[2];
  act(() => store.dispatch(rooms.Actions.setJoinGameError({ code: Response_ResponseCode.RespWrongPassword, message: '', requestId })));
  expect(screen.getByText('JoinGameError.wrongPassword')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));
  expect(store.getState().rooms.joinGameError).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: /^Join$/ }));
  const retryId = vi.mocked(webClient.request.rooms.joinGame).mock.lastCall?.[2];
  act(() => store.dispatch(rooms.Actions.setJoinGameError({
    code: Response_ResponseCode.RespNotConnected, message: '', failure: WebsocketTypes.CommandFailure.Timeout, requestId: retryId,
  })));
  expect(screen.getByText('CommandFailure.timeout')).toBeInTheDocument();
});
