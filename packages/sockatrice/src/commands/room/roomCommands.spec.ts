vi.mock('../../WebClient');

import { makeCallbackHelpers } from '../../testing/callback-helpers';
import { WebClient } from '../../WebClient';
import {
  Command_CreateGame_ext,
  Command_CreateGameSchema,
  Command_JoinGame_ext,
  Command_JoinGameSchema,
  Command_LeaveRoom_ext,
  Command_RoomSay_ext,
  Response_ResponseCode,
} from '../../generated';

import { createGame } from './createGame';
import { joinGame } from './joinGame';
import { leaveRoom } from './leaveRoom';
import { roomSay } from './roomSay';
import { create } from '@bufbuild/protobuf';
import { CommandFailure } from '../../types/CommandFailure';
import { Mock } from 'vitest';

const { invokeOnSuccess, invokeResponseCode, invokeOnError } = makeCallbackHelpers(
  WebClient.instance.protobuf.sendRoomCommand as Mock,
  // sendRoomCommand(roomId, ext, value, options) — options at index 3
  3
);

describe('createGame', () => {

  it('calls sendRoomCommand with Command_CreateGame', () => {
    createGame(5, create(Command_CreateGameSchema, { maxPlayers: 4 }));
    expect(WebClient.instance.protobuf.sendRoomCommand).toHaveBeenCalledWith(
      5, Command_CreateGame_ext, expect.objectContaining({ maxPlayers: 4 }), expect.any(Object)
    );
  });

  it('onSuccess calls response.room.gameCreated with roomId', () => {
    createGame(5, create(Command_CreateGameSchema, {}));
    invokeOnSuccess();
    expect(WebClient.instance.response.room.gameCreated).toHaveBeenCalledWith(5);
  });

  it('onError reports the failure with roomId, code and transport reason', () => {
    createGame(5, create(Command_CreateGameSchema, {}));
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Timeout);
    expect(WebClient.instance.response.room.createGameFailed).toHaveBeenCalledWith(
      5, Response_ResponseCode.RespNotConnected, CommandFailure.Timeout,
    );
  });

  it('onError reports a server rejection without a transport reason', () => {
    createGame(5, create(Command_CreateGameSchema, {}));
    invokeOnError(Response_ResponseCode.RespContextError);
    expect(WebClient.instance.response.room.createGameFailed).toHaveBeenCalledWith(
      5, Response_ResponseCode.RespContextError, undefined,
    );
  });
});

describe('joinGame', () => {
  beforeEach(() => {
    (WebClient.instance.response.room.joinedGame as Mock).mockClear();
    (WebClient.instance.response.room.setJoinGamePending as Mock).mockClear();
    (WebClient.instance.response.room.setJoinGameError as Mock).mockClear();
  });

  it('calls sendRoomCommand with Command_JoinGame', () => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42, password: '' }));
    expect(WebClient.instance.protobuf.sendRoomCommand).toHaveBeenCalledWith(
      7, Command_JoinGame_ext, expect.objectContaining({ gameId: 42, password: '' }), expect.any(Object)
    );
  });

  it('dispatches setJoinGamePending(true) before sending', () => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    expect(WebClient.instance.response.room.setJoinGamePending).toHaveBeenCalledWith(true);
  });

  it('onSuccess clears pending and calls response.room.joinedGame with roomId and gameId', () => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    invokeOnSuccess();
    expect(WebClient.instance.response.room.setJoinGamePending).toHaveBeenLastCalledWith(false);
    expect(WebClient.instance.response.room.joinedGame).toHaveBeenCalledWith(7, 42);
  });

  // Desktop GameSelector::checkResponse — matching message strings from
  // cockatrice/src/interface/widgets/server/game_selector.cpp:234-260.
  const errorCases: Array<[number, string]> = [
    [Response_ResponseCode.RespNotInRoom, 'Please join the appropriate room first.'],
    [Response_ResponseCode.RespNameNotFound, 'The game does not exist any more.'],
    [Response_ResponseCode.RespGameFull, 'The game is already full.'],
    [Response_ResponseCode.RespWrongPassword, 'Wrong password.'],
    [Response_ResponseCode.RespSpectatorsNotAllowed, 'Spectators are not allowed in this game.'],
    [Response_ResponseCode.RespOnlyBuddies, 'This game is only open to its creator\'s buddies.'],
    [Response_ResponseCode.RespUserLevelTooLow, 'This game is only open to registered users.'],
    [Response_ResponseCode.RespInIgnoreList, 'You are being ignored by the creator of this game.'],
  ];

  it.each(errorCases)('code %i dispatches setJoinGameError with desktop-matching message', (code, message) => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    invokeResponseCode(code);
    expect(WebClient.instance.response.room.setJoinGameError).toHaveBeenCalledWith(code, message);
    expect(WebClient.instance.response.room.joinedGame).not.toHaveBeenCalled();
  });

  it('code 11 (RespContextError) is silent — clears pending, no setJoinGameError, no console.error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    invokeResponseCode(Response_ResponseCode.RespContextError);
    expect(WebClient.instance.response.room.setJoinGameError).not.toHaveBeenCalled();
    expect(WebClient.instance.response.room.setJoinGamePending).toHaveBeenLastCalledWith(false);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('unknown response code goes to onError — clears pending, no setJoinGameError', () => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    invokeOnError(99);
    expect(WebClient.instance.response.room.setJoinGameError).not.toHaveBeenCalled();
    expect(WebClient.instance.response.room.setJoinGamePending).toHaveBeenLastCalledWith(false);
  });

  it.each([
    [CommandFailure.Timeout, 'The server did not respond. Please try again.'],
    [CommandFailure.Disconnected, 'The connection to the server has been lost.'],
    [CommandFailure.NotSent, 'You are not connected to the server.'],
  ])('a %s failure settles the join dialog with a visible error', (failure, message) => {
    joinGame(7, create(Command_JoinGameSchema, { gameId: 42 }));
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, failure);
    expect(WebClient.instance.response.room.setJoinGameError).toHaveBeenCalledWith(
      Response_ResponseCode.RespNotConnected, message,
    );
  });
});

describe('leaveRoom', () => {

  it('calls sendRoomCommand with Command_LeaveRoom', () => {
    leaveRoom(3);
    expect(WebClient.instance.protobuf.sendRoomCommand).toHaveBeenCalledWith(
      3, Command_LeaveRoom_ext, expect.any(Object), expect.any(Object)
    );
  });

  it('onSuccess calls response.room.leaveRoom with roomId', () => {
    leaveRoom(3);
    invokeOnSuccess();
    expect(WebClient.instance.response.room.leaveRoom).toHaveBeenCalledWith(3);
  });
});

describe('roomSay', () => {

  it('calls sendRoomCommand with trimmed message', () => {
    roomSay(2, '  hello  ');
    expect(WebClient.instance.protobuf.sendRoomCommand).toHaveBeenCalledWith(
      2,
      Command_RoomSay_ext,
      expect.objectContaining({ message: 'hello' }),
      expect.any(Object),
    );
  });

  it('does not call sendRoomCommand when message is blank', () => {
    roomSay(2, '   ');
    expect(WebClient.instance.protobuf.sendRoomCommand).not.toHaveBeenCalled();
  });

  it('does not call sendRoomCommand when message is empty string', () => {
    roomSay(2, '');
    expect(WebClient.instance.protobuf.sendRoomCommand).not.toHaveBeenCalled();
  });

  it('reports a flood rejection with the unsent message', () => {
    roomSay(2, '  hello  ');
    invokeResponseCode(Response_ResponseCode.RespChatFlood);
    expect(WebClient.instance.response.room.roomSayFlooded).toHaveBeenCalledWith(2, 'hello');
  });
});
