import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { create } from '@bufbuild/protobuf';
import { Response_ResponseCode, ServerInfo_User, ServerInfo_UserSchema } from '@cockatrice/sockatrice/generated';
import { normalizeBannedUserError } from '../../common';
import { ServerState } from './server.interfaces';

export const accountReducers = {
  registrationFailed: ((state, action) => {
    const { reason, endTime, responseCode } = action.payload;
    const limited = responseCode === Response_ResponseCode.RespTooManyRequests;
    const error = endTime && !limited
      ? normalizeBannedUserError(reason, endTime)
      : reason;
    state.registrationError = error;
    state.registrationDeniedEndTime = limited ? endTime ?? null : null;
  }) as CaseReducer<ServerState, PayloadAction<{ reason: string; endTime?: number; responseCode?: number }>>,

  clearRegistrationErrors: ((state) => {
    state.registrationError = null;
    state.registrationDeniedEndTime = null;
  }) as CaseReducer<ServerState>,

  accountEditChanged: ((state, action) => {
    if (state.user) {
      const changed = Object.fromEntries(Object.entries(action.payload.user).filter(([, value]) => value !== undefined));
      state.user = create(ServerInfo_UserSchema, { ...state.user, ...changed });
      delete state.userInfo[state.user.name];
    }
  }) as CaseReducer<ServerState, PayloadAction<{ user: Partial<ServerInfo_User> }>>,

  accountImageChanged: ((state, action) => {
    if (state.user) {
      state.user = create(ServerInfo_UserSchema, { ...state.user, ...action.payload.user });
    }
  }) as CaseReducer<ServerState, PayloadAction<{ user: Partial<ServerInfo_User> }>>,
};
