import { createAction } from '@reduxjs/toolkit';

import { roomsSlice } from './rooms.reducer';
import type { RoomCommandFailedPayload } from './rooms.interfaces';

const SignalActions = {
  gameCreated: createAction<{ roomId: number }>('rooms/gameCreated'),
  // Command failure outcomes; `failure` as on the server `*Failed` actions. A
  // join-room failure is a slice reducer instead (rooms.joinRoomError).
  createGameFailed: createAction<RoomCommandFailedPayload>('rooms/createGameFailed'),
};

export const Actions = { ...roomsSlice.actions, ...SignalActions };

export type RoomsAction = ReturnType<typeof Actions[keyof typeof Actions]>;
