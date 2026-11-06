import type { Event_ServerIdentification } from '../../generated';
import { WebClient } from '../../WebClient';
import { StatusEnum } from '../../types/StatusEnum';
import { consumePendingOptions } from '../../utils/connectionState';
import { WebSocketConnectReason } from '../../types/ConnectOptions';
import { generateSalt, generatePasswordVerifier, hashPassword, passwordHashAvailable, passwordSaltSupported } from '../../utils';
import { loginWithoutChallenge, loginWithPasswordSalt } from '../../commands/session/loginWithChallenge';
import * as SessionCommands from '../../commands/session';
import { CommandFailure } from '../../types/CommandFailure';

function onSaltFailure(settle: (failure?: CommandFailure, responseCode?: number) => void) {
  return (failure?: CommandFailure, responseCode?: number) => {
    settle(failure, responseCode);
    if (failure !== CommandFailure.Disconnected) {
      SessionCommands.disconnect();
    }
  };
}

async function sendWithNewVerifier(
  password: string,
  onLost: () => void,
  onError: () => void,
  send: (verifier: string) => void,
): Promise<void> {
  const stillCurrent = WebClient.instance.beginAuthentication(onLost);
  let verifier: string;
  try {
    verifier = await generatePasswordVerifier(password);
  } catch {
    if (stillCurrent()) {
      onError();
    }
    return;
  }
  if (stillCurrent()) {
    send(verifier);
  }
}

export async function serverIdentification(info: Event_ServerIdentification): Promise<void> {
  const { serverName, serverVersion, protocolVersion, serverOptions } = info;
  const response = WebClient.instance.response;

  if (protocolVersion !== WebClient.instance.protocolVersion) {
    SessionCommands.updateStatus(StatusEnum.DISCONNECTED, `Protocol version mismatch: ${protocolVersion}`);
    response.session.connectionFailed();
    SessionCommands.disconnect();
    return;
  }

  const serverSupportsPasswordHash = passwordSaltSupported(serverOptions);
  WebClient.instance.serverSupportsPasswordHash = serverSupportsPasswordHash;
  WebClient.instance.serverSupportsChallengeResponse = info.supportsChallengeResponse;
  const getPasswordSalt = serverSupportsPasswordHash && passwordHashAvailable();
  const options = consumePendingOptions();

  if (!options) {
    SessionCommands.updateStatus(StatusEnum.DISCONNECTED, 'Connection lost — please log in again');
    response.session.connectionFailed();
    SessionCommands.disconnect();
    return;
  }

  response.session.updateInfo(serverName, serverVersion, serverSupportsPasswordHash);

  switch (options.reason) {
    case WebSocketConnectReason.LOGIN: {
      const { password, ...rest } = options;
      SessionCommands.updateStatus(StatusEnum.LOGGING_IN, 'Logging In...');
      if (getPasswordSalt || info.supportsChallengeResponse) {
        SessionCommands.requestPasswordSalt(rest,
          {
            onResponse: (response) => {
              void loginWithPasswordSalt(rest, password, response);
            },
          },
          onSaltFailure((_failure, responseCode) => {
            response.session.loginFailed(responseCode === undefined ? undefined : { responseCode });
          }),
        );
      } else {
        loginWithoutChallenge(rest, password);
      }
      break;
    }
    case WebSocketConnectReason.REGISTER: {
      const { password, ...rest } = options;
      if (info.supportsChallengeResponse) {
        await sendWithNewVerifier(
          password,
          () => response.session.registrationFailed('The connection to the server has been lost.'),
          () => {
            response.session.registrationFailed('Unable to prepare the password verifier. Please try again.');
            SessionCommands.updateStatus(StatusEnum.DISCONNECTED, 'Registration failed');
            SessionCommands.disconnect();
          },
          (hashedPassword) => SessionCommands.register({ ...rest, hashedPassword }, password),
        );
      } else if (getPasswordSalt) {
        const passwordSalt = generateSalt();
        const hashedPassword = await hashPassword(passwordSalt, password);
        SessionCommands.register({ ...rest, hashedPassword }, password);
      } else {
        SessionCommands.register(rest, password);
      }
      break;
    }
    case WebSocketConnectReason.ACTIVATE_ACCOUNT: {
      const { password, ...rest } = options;
      if (info.supportsChallengeResponse) {
        SessionCommands.activate(rest, password);
      } else if (getPasswordSalt) {
        SessionCommands.requestPasswordSalt(rest,
          async (salt) => {
            const hashedPassword = salt ? await hashPassword(salt, password) : undefined;
            SessionCommands.activate(rest, password, hashedPassword);
          },
          onSaltFailure((failure) => response.session.accountActivationFailed(failure)),
        );
      } else {
        SessionCommands.activate(rest, password);
      }
      break;
    }
    case WebSocketConnectReason.PASSWORD_RESET_REQUEST:
      SessionCommands.forgotPasswordRequest(options);
      break;
    case WebSocketConnectReason.PASSWORD_RESET_CHALLENGE:
      SessionCommands.forgotPasswordChallenge(options);
      break;
    case WebSocketConnectReason.PASSWORD_RESET: {
      const { newPassword, ...rest } = options;
      if (info.supportsChallengeResponse) {
        await sendWithNewVerifier(
          newPassword,
          () => response.session.resetPasswordFailed(),
          () => {
            response.session.resetPasswordFailed();
            SessionCommands.updateStatus(StatusEnum.DISCONNECTED, 'Unable to prepare the password verifier. Please try again.');
            SessionCommands.disconnect();
          },
          (hashedNewPassword) => SessionCommands.forgotPasswordReset({ ...rest, hashedNewPassword }, newPassword),
        );
      } else if (getPasswordSalt) {
        SessionCommands.requestPasswordSalt(rest,
          async (salt) => {
            if (salt) {
              const hashedNewPassword = await hashPassword(salt, newPassword);
              SessionCommands.forgotPasswordReset({ ...rest, hashedNewPassword }, newPassword);
            } else {
              SessionCommands.forgotPasswordReset(rest, newPassword);
            }
          },
          onSaltFailure(() => response.session.resetPasswordFailed()),
        );
      } else {
        SessionCommands.forgotPasswordReset(rest, newPassword);
      }
      break;
    }
    default: {
      SessionCommands.updateStatus(StatusEnum.DISCONNECTED, `Unknown Connection Reason: ${(options as { reason: number }).reason}`);
      SessionCommands.disconnect();
      break;
    }
  }
}
