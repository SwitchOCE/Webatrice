import type { LoginParams, Response_PasswordSalt } from '../../generated';
import { WebClient } from '../../WebClient';
import type { ConnectTarget } from '../../types/WebClientConfig';
import { CommandFailure } from '../../types/CommandFailure';
import { hashPassword, PasswordRequiredError, prepareChallengeLogin } from '../../utils';
import { disconnect, login, requestPasswordSalt } from './';
import { rejectLocalLogin } from './loginFailure';

export function loginWithoutChallenge(options: ConnectTarget & LoginParams, password?: string): void {
  const hashedPassword = password && options.hashedPassword?.startsWith('$scrypt$') ? undefined : options.hashedPassword;
  login({ ...options, hashedPassword }, password);
}

export async function loginWithPasswordSalt(
  options: ConnectTarget & LoginParams,
  password: string | undefined,
  salt: Response_PasswordSalt,
): Promise<void> {
  const client = WebClient.instance;
  const generation = client.connectionGeneration;
  const isCurrent = () => client.connectionGeneration === generation;
  const derivingKey = salt.passwordSalt && client.serverSupportsChallengeResponse && salt.nonce?.length
    && !salt.needsMigration && Boolean(password);
  let interrupted = false;
  const onDisconnect = () => {
    interrupted = true;
    client.response.session.loginFailed();
  };
  if (derivingKey) {
    client.pendingAuthentication = onDisconnect;
  }
  try {
    if (salt.passwordSalt && client.serverSupportsChallengeResponse && salt.nonce?.length) {
      const { hashedPassword, credential } = await prepareChallengeLogin(salt, password, options.hashedPassword);
      if (derivingKey && (!isCurrent() || interrupted)) {
        return;
      }
      login({ ...options, hashedPassword }, undefined, credential);
    } else {
      if (options.hashedPassword?.startsWith('$scrypt$') && !password) {
        throw new PasswordRequiredError('Login failed: please enter your password to sign in again');
      }
      const fallbackOptions = options.hashedPassword?.startsWith('$scrypt$') ? { ...options, hashedPassword: undefined } : options;
      if (salt.passwordSalt) {
        const hashedPassword = fallbackOptions.hashedPassword || await hashPassword(salt.passwordSalt, password);
        login({ ...fallbackOptions, hashedPassword }, password);
      } else {
        login(fallbackOptions, password);
      }
    }
  } catch (error) {
    if (!derivingKey || (isCurrent() && !interrupted)) {
      rejectLocalLogin(error);
    }
  } finally {
    if (client.pendingAuthentication === onDisconnect) {
      client.pendingAuthentication = undefined;
    }
  }
}

export function loginWithFreshSalt(options: ConnectTarget & LoginParams, password?: string): void {
  const { host, port, userName } = options;
  requestPasswordSalt({ host, port, userName }, {
    onResponse: (response) => {
      void loginWithPasswordSalt(options, password, response);
    },
  }, (failure) => {
    WebClient.instance.response.session.loginFailed();
    if (failure !== CommandFailure.Disconnected) {
      disconnect();
    }
  });
}
