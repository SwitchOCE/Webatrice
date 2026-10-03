import { createAction } from '@reduxjs/toolkit';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { roomsSlice } from './rooms.reducer';

export interface RoomCommandFailedPayload {
  roomId: number;
  responseCode: number;
  failure?: WebsocketTypes.CommandFailure;
}

const SignalActions = {
  gameCreated: createAction<{ roomId: number }>('rooms/gameCreated'),
  // Command failure outcomes; `failure` as on the server `*Failed` actions.
  joinRoomFailed: createAction<RoomCommandFailedPayload>('rooms/joinRoomFailed'),
  createGameFailed: createAction<RoomCommandFailedPayload>('rooms/createGameFailed'),
};

export const Actions = { ...roomsSlice.actions, ...SignalActions };

export type RoomsAction = ReturnType<typeof Actions[keyof typeof Actions]>;
