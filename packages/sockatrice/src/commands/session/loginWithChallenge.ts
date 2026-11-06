import type { LoginParams, Response_PasswordSalt } from '../../generated';
import { WebClient } from '../../WebClient';
import type { ConnectTarget } from '../../types/WebClientConfig';
import { CommandFailure } from '../../types/CommandFailure';
import { hashPassword, prepareChallengeLogin } from '../../utils';
import { disconnect, login, requestPasswordSalt } from './';
import { rejectLocalLogin } from './loginFailure';

function withoutVerifierWhenTyped<T extends LoginParams>(options: T, password?: string): T {
  return password && options.hashedPassword?.startsWith('$scrypt$') ? { ...options, hashedPassword: undefined } : options;
}

export function loginWithoutChallenge(options: ConnectTarget & LoginParams, password?: string): void {
  login(withoutVerifierWhenTyped(options, password), password);
}

async function loginWithChallengeResponse(
  options: ConnectTarget & LoginParams,
  password: string | undefined,
  salt: Response_PasswordSalt,
): Promise<void> {
  const client = WebClient.instance;
  const stillCurrent = client.beginAuthentication(() => client.response.session.loginFailed());
  let prepared: Awaited<ReturnType<typeof prepareChallengeLogin>>;
  try {
    prepared = await prepareChallengeLogin(salt, password, options.hashedPassword);
  } catch (error) {
    if (stillCurrent()) {
      rejectLocalLogin(error);
    }
    return;
  }
  if (stillCurrent()) {
    login({ ...options, hashedPassword: prepared.hashedPassword }, undefined, prepared.credential);
  }
}

export async function loginWithPasswordSalt(
  options: ConnectTarget & LoginParams,
  password: string | undefined,
  salt: Response_PasswordSalt,
): Promise<void> {
  if (salt.passwordSalt && WebClient.instance.serverSupportsChallengeResponse && salt.nonce?.length) {
    await loginWithChallengeResponse(options, password, salt);
    return;
  }
  const fallback = withoutVerifierWhenTyped(options, password);
  try {
    const hashedPassword = salt.passwordSalt && !fallback.hashedPassword
      ? await hashPassword(salt.passwordSalt, password)
      : fallback.hashedPassword;
    login({ ...fallback, hashedPassword }, password);
  } catch (error) {
    rejectLocalLogin(error);
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
