import { createAction } from '@reduxjs/toolkit';

import { roomsSlice } from './rooms.reducer';
import type { JoinRoomFailedPayload, RoomCommandFailedPayload } from './rooms.interfaces';

const SignalActions = {
  gameCreated: createAction<{ roomId: number }>('rooms/gameCreated'),
  // Command failure outcomes; `failure` as on the server `*Failed` actions.
  joinRoomFailed: createAction<JoinRoomFailedPayload>('rooms/joinRoomFailed'),
  createGameFailed: createAction<RoomCommandFailedPayload>('rooms/createGameFailed'),
};

export const Actions = { ...roomsSlice.actions, ...SignalActions };

export type RoomsAction = ReturnType<typeof Actions[keyof typeof Actions]>;
