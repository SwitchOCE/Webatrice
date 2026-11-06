import { WebClient } from '../../WebClient';
import { StatusEnum } from '../../types/StatusEnum';
import { AuthenticationDowngradeError, PasswordRequiredError } from '../../utils/passwordChallenge';
import { disconnect, updateStatus } from './';

export function rejectLocalLogin(error: unknown): void {
  const reason = error instanceof PasswordRequiredError ? 'passwordRequired'
    : error instanceof AuthenticationDowngradeError ? 'authenticationDowngrade' : 'authenticationUnsupported';
  updateStatus(StatusEnum.DISCONNECTED, error instanceof Error ? error.message : 'Login failed: unable to prepare authentication');
  WebClient.instance.response.session.loginFailed({ localFailure: reason });
  disconnect();
}
