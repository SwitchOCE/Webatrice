import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { App, Enriched } from '../../types';

export interface RoomsState {
  rooms: RoomsStateRooms;
  joinedRoomIds: JoinedRooms;
  joinedGameIds: JoinedGames;
  messages: RoomsStateMessages;
  sortGamesBy: RoomsStateSortGamesBy;
  sortUsersBy: RoomsStateSortUsersBy;
  selectedGameIds: SelectedGameIds;
  gameFilters: RoomsStateGameFilters;
  joinGamePending: boolean;
  joinGameError: JoinGameError | null;
  joinRoomError: JoinRoomError | null;
}

// Payload of the rooms `*Failed` command-outcome signal actions. `failure` is
// set when the server never answered and undefined for a server rejection.
export interface RoomCommandFailedPayload {
  requestId?: string;
  roomId: number;
  responseCode: number;
  failure?: WebsocketTypes.CommandFailure;
}

// A failed user-initiated Command_JoinRoom: the raw Response.ResponseCode, which the UI
// maps to desktop's joinRoomFinished message, and `failure` when the server never answered.
export interface JoinRoomFailedPayload extends RoomCommandFailedPayload {
  /** False for an autojoin, which desktop fails without a message box. */
  userInitiated: boolean;
}

export interface JoinGameError {
  failure?: WebsocketTypes.CommandFailure;
  code: number;
  message: string;
}

export type JoinRoomError = RoomCommandFailedPayload;

export interface RoomsStateRooms {
  [roomId: number]: Enriched.Room;
}

export interface JoinedRooms {
  [roomId: number]: boolean;
}

export interface JoinedGames {
  [roomId: number]: {
    [gameId: number]: boolean;
  };
}

export interface RoomsStateMessages {
  [roomId: number]: Enriched.Message[];
}

export interface RoomsStateSortGamesBy extends App.SortBy {
  field: App.GameSortField
}

export interface RoomsStateSortUsersBy extends App.SortBy {
  field: App.UserSortField
}

export interface SelectedGameIds {
  [roomId: number]: number | undefined;
}

export interface RoomsStateGameFilters {
  [roomId: number]: GameFilters;
}

export interface GameFilters {
  hideBuddiesOnlyGames: boolean;
  hideIgnoredUserGames: boolean;
  hideFullGames: boolean;
  hideGamesThatStarted: boolean;
  hidePasswordProtectedGames: boolean;
  hideNotBuddyCreatedGames: boolean;
  hideOpenDecklistGames: boolean;
  gameNameFilter: string;
  creatorNameFilters: string[];
  gameTypeFilter: number[];
  maxPlayersFilterMin: number;
  maxPlayersFilterMax: number;
  maxGameAgeSeconds: number;
  showOnlyIfSpectatorsCanWatch: boolean;
  showSpectatorPasswordProtected: boolean;
  showOnlyIfSpectatorsCanChat: boolean;
  showOnlyIfSpectatorsCanSeeHands: boolean;
}
