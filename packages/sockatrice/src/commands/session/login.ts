import { create, getExtension } from '@bufbuild/protobuf';
import type { MessageInitShape } from '@bufbuild/protobuf';
import {
  Command_Login_ext,
  Command_LoginSchema,
  Response_Login_ext,
  Response_ResponseCode,
  type LoginParams,
  type Response,
} from '../../generated';

import { CommandFailure } from '../../services/command-options';
import { StatusEnum } from '../../types/StatusEnum';
import { WebClient } from '../../WebClient';
import type { LoginFailure } from '../../types/SignalContexts';
import type { ConnectTarget } from '../../types/WebClientConfig';
import { PasswordRequiredError } from '../../utils/passwordChallenge';
import { rejectLocalLogin } from './loginFailure';
import {
  disconnect,
  listUsers,
  listRooms,
  updateStatus,
} from './';

export function login(options: ConnectTarget & LoginParams, password?: string, credential = options.hashedPassword): void {
  const { userName, hashedPassword } = options;

  if (hashedPassword?.startsWith('$scrypt$')) {
    rejectLocalLogin(new PasswordRequiredError('Login failed: please enter your password to sign in again'));
    return;
  }

  const { clientConfig } = WebClient.instance;
  const loginConfig: MessageInitShape<typeof Command_LoginSchema> = {
    ...clientConfig,
    clientfeatures: [...clientConfig.clientfeatures],
    clientid: 'webatrice',
    userName,
    ...(hashedPassword
      ? { hashedPassword }
      : { password }),
  };

  const onLoginError = (failure: LoginFailure, message: string, extra?: () => void) => {
    updateStatus(StatusEnum.DISCONNECTED, message);
    extra?.();
    WebClient.instance.response.session.loginFailed(failure);
    disconnect();
  };

  const rejectWith = (message: string, extra?: () => void) =>
    (raw: Response) => onLoginError({ responseCode: raw.responseCode }, message, extra);

  const rejectWithDetails = (message: string) => (raw: Response) => {
    const { deniedEndTime, deniedReasonStr, missingFeatures } = getExtension(raw, Response_Login_ext);
    onLoginError({
      responseCode: raw.responseCode,
      deniedEndTime: Number(deniedEndTime),
      deniedReason: deniedReasonStr,
      missingFeatures,
    }, message);
  };

  WebClient.instance.protobuf.sendSessionCommand(Command_Login_ext, create(Command_LoginSchema, loginConfig), {
    responseExt: Response_Login_ext,
    onSuccess: (resp) => {
      const { buddyList, ignoreList, userInfo, missingFeatures } = resp;

      WebClient.instance.response.session.updateBuddyList(buddyList);
      WebClient.instance.response.session.updateIgnoreList(ignoreList);
      WebClient.instance.response.session.updateUser(userInfo);
      WebClient.instance.response.session.loginSuccessful({
        hashedPassword: credential?.startsWith('$challenge$') ? undefined : credential,
        missingFeatures,
      });

      listUsers();
      listRooms();

      updateStatus(StatusEnum.LOGGED_IN, 'Logged in.');
    },
    onResponseCode: {
      [Response_ResponseCode.RespClientUpdateRequired]: rejectWithDetails('Login failed: missing features'),
      [Response_ResponseCode.RespWrongPassword]: rejectWith('Login failed: incorrect username or password'),
      [Response_ResponseCode.RespUsernameInvalid]: rejectWithDetails('Login failed: invalid username'),
      [Response_ResponseCode.RespWouldOverwriteOldSession]: rejectWith('Login failed: duplicated user session'),
      [Response_ResponseCode.RespUserIsBanned]: rejectWithDetails('Login failed: banned user'),
      [Response_ResponseCode.RespRegistrationRequired]: rejectWith('Login failed: registration required'),
      [Response_ResponseCode.RespClientIdRequired]: rejectWith('Login failed: missing client ID'),
      [Response_ResponseCode.RespContextError]: rejectWith('Login failed: server error'),
      [Response_ResponseCode.RespPasswordChangeRequired]: rejectWith('Login failed: password change required'),
      [Response_ResponseCode.RespServerFull]: rejectWith('Login failed: server is full'),
      [Response_ResponseCode.RespTooManyRequests]: rejectWithDetails('Login failed: too many attempts. Please try again later.'),
      [Response_ResponseCode.RespAccountNotActivated]: rejectWith('Login failed: account not activated',
        () => {
          WebClient.instance.response.session.accountAwaitingActivation({
            host: options.host,
            port: options.port,
            userName: options.userName,
          });
        }
      ),
    },
    onError: (responseCode, _raw, failure) => {
      if (failure === CommandFailure.Disconnected) {
        WebClient.instance.response.session.loginFailed();
        return;
      }
      if (failure === undefined) {
        onLoginError({ responseCode }, `Login failed: unknown error: ${responseCode}`);
        return;
      }
      onLoginError({}, failure === CommandFailure.Timeout
        ? 'Login failed: the server did not respond'
        : `Login failed: unknown error: ${responseCode}`);
    },
  });
}
