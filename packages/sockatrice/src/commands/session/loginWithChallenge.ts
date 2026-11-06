import type { LoginParams, Response_PasswordSalt } from '../../generated';
import { WebClient } from '../../WebClient';
import type { ConnectTarget } from '../../types/WebClientConfig';
import { CommandFailure } from '../../types/CommandFailure';
import { hashPassword, PasswordRequiredError, prepareChallengeLogin } from '../../utils';
import { disconnect, login, requestPasswordSalt } from './';
import { rejectLocalLogin } from './loginFailure';

export async function loginWithPasswordSalt(
  options: ConnectTarget & LoginParams,
  password: string | undefined,
  salt: Response_PasswordSalt,
): Promise<void> {
  const client = WebClient.instance;
  const generation = client.connectionGeneration;
  const isCurrent = () => client.connectionGeneration === generation;
  try {
    if (salt.passwordSalt && client.serverSupportsChallengeResponse && salt.nonce?.length) {
      const { hashedPassword, credential } = await prepareChallengeLogin(salt, password, options.hashedPassword);
      if (!isCurrent()) {
        return;
      }
      login({ ...options, hashedPassword }, undefined, credential);
    } else {
      if (options.hashedPassword?.startsWith('$scrypt$')) {
        throw new PasswordRequiredError('Login failed: please enter your password to sign in again');
      }
      if (salt.passwordSalt) {
        const hashedPassword = options.hashedPassword || await hashPassword(salt.passwordSalt, password);
        if (isCurrent()) {
          login({ ...options, hashedPassword }, password);
        }
      } else {
        login(options, password);
      }
    }
  } catch (error) {
    if (isCurrent()) {
      rejectLocalLogin(error);
    }
  }
}

export function loginWithFreshSalt(options: ConnectTarget & LoginParams, password?: string): void {
  const client = WebClient.instance;
  const generation = client.connectionGeneration;
  const isCurrent = () => client.connectionGeneration === generation;
  const { host, port, userName } = options;
  requestPasswordSalt({ host, port, userName }, (_salt, response) => {
    if (isCurrent()) {
      void loginWithPasswordSalt(options, password, response);
    }
  }, (failure) => {
    if (!isCurrent()) {
      return;
    }
    WebClient.instance.response.session.loginFailed();
    if (failure !== CommandFailure.Disconnected) {
      disconnect();
    }
  });
}
