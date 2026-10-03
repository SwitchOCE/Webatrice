import { createAction } from '@reduxjs/toolkit';

import { Enriched } from '../../types';
import { roomsSlice } from './rooms.reducer';
import type { RoomCommandFailedPayload } from './rooms.interfaces';

const SignalActions = {
  gameCreated: createAction<{ roomId: number }>('rooms/gameCreated'),
  // Command failure outcomes; `failure` as on the server `*Failed` actions. A
  // join-room failure is a slice reducer instead (rooms.joinRoomError).
  createGameFailed: createAction<RoomCommandFailedPayload>('rooms/createGameFailed'),
  // Inbound Event_RoomSay; the rooms listener filters it before addMessage stores it.
  roomSayReceived: createAction<{ roomId: number; message: Enriched.Message }>('rooms/roomSayReceived'),
};

export const Actions = { ...roomsSlice.actions, ...SignalActions };

export type RoomsAction = ReturnType<typeof Actions[keyof typeof Actions]>;
