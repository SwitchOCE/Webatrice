import { Response_ResponseCode, type LoginParams, type Response_PasswordSalt } from '../../generated';
import { WebClient } from '../../WebClient';
import type { ConnectTarget } from '../../types/WebClientConfig';
import { StatusEnum } from '../../types/StatusEnum';
import { CommandFailure } from '../../types/CommandFailure';
import { hashPassword, PasswordRequiredError, prepareChallengeLogin } from '../../utils';
import { disconnect, login, requestPasswordSalt, updateStatus } from './';

export async function loginWithPasswordSalt(
  options: ConnectTarget & LoginParams,
  password: string | undefined,
  salt: Response_PasswordSalt,
): Promise<void> {
  try {
    if (salt.passwordSalt && WebClient.instance.serverSupportsChallengeResponse && salt.nonce?.length) {
      const { hashedPassword, credential } = await prepareChallengeLogin(salt, password, options.hashedPassword);
      login({ ...options, hashedPassword }, undefined, credential);
    } else if (salt.passwordSalt) {
      const hashedPassword = options.hashedPassword || await hashPassword(salt.passwordSalt, password);
      login({ ...options, hashedPassword }, password);
    } else {
      login(options, password);
    }
  } catch (error) {
    updateStatus(StatusEnum.DISCONNECTED, error instanceof Error ? error.message : 'Login failed: unable to prepare authentication');
    WebClient.instance.response.session.loginFailed(error instanceof PasswordRequiredError
      ? Response_ResponseCode.RespLoginNeeded : Response_ResponseCode.RespClientUpdateRequired);
    disconnect();
  }
}

export function loginWithFreshSalt(options: ConnectTarget & LoginParams, password?: string): void {
  const { host, port, userName } = options;
  requestPasswordSalt({ host, port, userName }, (_salt, response) => {
    void loginWithPasswordSalt(options, password, response);
  }, (failure) => {
    WebClient.instance.response.session.loginFailed();
    if (failure !== CommandFailure.Disconnected) {
      disconnect();
    }
  });
}
