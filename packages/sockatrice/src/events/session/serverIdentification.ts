import type { Event_ServerIdentification } from '../../generated';
import { WebClient } from '../../WebClient';
import { StatusEnum } from '../../types/StatusEnum';
import { consumePendingOptions } from '../../utils/connectionState';
import { WebSocketConnectReason } from '../../types/ConnectOptions';
import { generateSalt, generatePasswordVerifier, hashPassword, passwordHashAvailable, passwordSaltSupported } from '../../utils';
import { loginWithPasswordSalt } from '../../commands/session/loginWithChallenge';
import * as SessionCommands from '../../commands/session';
import { CommandFailure } from '../../types/CommandFailure';

function onSaltFailure(settle: (failure?: CommandFailure) => void, isCurrent: () => boolean) {
  return (failure?: CommandFailure) => {
    if (!isCurrent()) {
      return;
    }
    settle(failure);
    if (failure !== CommandFailure.Disconnected) {
      SessionCommands.disconnect();
    }
  };
}

export async function serverIdentification(info: Event_ServerIdentification): Promise<void> {
  const { serverName, serverVersion, protocolVersion, serverOptions } = info;
  const client = WebClient.instance;
  const generation = client.connectionGeneration;
  const isCurrent = () => client.connectionGeneration === generation;
  const response = client.response;

  if (protocolVersion !== WebClient.instance.protocolVersion) {
    SessionCommands.updateStatus(StatusEnum.DISCONNECTED, `Protocol version mismatch: ${protocolVersion}`);
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
    SessionCommands.disconnect();
    return;
  }

  switch (options.reason) {
    case WebSocketConnectReason.LOGIN: {
      const { password, ...rest } = options;
      SessionCommands.updateStatus(StatusEnum.LOGGING_IN, 'Logging In...');
      if (getPasswordSalt || info.supportsChallengeResponse) {
        SessionCommands.requestPasswordSalt(rest,
          async (_salt, response) => {
            if (isCurrent()) {
              await loginWithPasswordSalt(rest, password, response);
            }
          },
          onSaltFailure(() => response.session.loginFailed(), isCurrent),
        );
      } else {
        SessionCommands.login(rest, password);
      }
      break;
    }
    case WebSocketConnectReason.REGISTER: {
      const { password, ...rest } = options;
      if (info.supportsChallengeResponse) {
        try {
          const hashedPassword = await generatePasswordVerifier(password);
          if (!isCurrent()) {
            return;
          }
          SessionCommands.register({ ...rest, hashedPassword }, password);
        } catch {
          if (!isCurrent()) {
            return;
          }
          response.session.registrationFailed('Unable to prepare the password verifier. Please try again.');
          SessionCommands.updateStatus(StatusEnum.DISCONNECTED, 'Registration failed');
          SessionCommands.disconnect();
        }
      } else if (getPasswordSalt) {
        const passwordSalt = generateSalt();
        const hashedPassword = await hashPassword(passwordSalt, password);
        if (!isCurrent()) {
          return;
        }
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
            if (!isCurrent()) {
              return;
            }
            const hashedPassword = salt ? await hashPassword(salt, password) : undefined;
            if (isCurrent()) {
              SessionCommands.activate(rest, password, hashedPassword);
            }
          },
          onSaltFailure((failure) => response.session.accountActivationFailed(failure), isCurrent),
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
        try {
          const hashedNewPassword = await generatePasswordVerifier(newPassword);
          if (!isCurrent()) {
            return;
          }
          SessionCommands.forgotPasswordReset({ ...rest, hashedNewPassword }, newPassword);
        } catch {
          if (!isCurrent()) {
            return;
          }
          response.session.resetPasswordFailed();
          SessionCommands.updateStatus(StatusEnum.DISCONNECTED, 'Unable to prepare the password verifier. Please try again.');
          SessionCommands.disconnect();
        }
      } else if (getPasswordSalt) {
        SessionCommands.requestPasswordSalt(rest,
          async (salt) => {
            if (!isCurrent()) {
              return;
            }
            if (salt) {
              const hashedNewPassword = await hashPassword(salt, newPassword);
              if (isCurrent()) {
                SessionCommands.forgotPasswordReset({ ...rest, hashedNewPassword }, newPassword);
              }
            } else {
              SessionCommands.forgotPasswordReset(rest, newPassword);
            }
          },
          onSaltFailure(() => response.session.resetPasswordFailed(), isCurrent),
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

  if (isCurrent()) {
    response.session.updateInfo(serverName, serverVersion, serverSupportsPasswordHash);
  }
}
