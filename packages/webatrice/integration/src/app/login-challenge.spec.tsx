import { createHmac, createHash, scryptSync } from 'node:crypto';
import { create } from '@bufbuild/protobuf';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Login } from '@app/features/login';
import { HostDTO, SettingDTO } from '@app/services';
import { APP_USER } from '@app/types';
import { settingsStore } from '../../../src/hooks/useSettings';
import { knownHostsStore } from '../../../src/feature-widgets/known-hosts/useKnownHosts';
import { autoLoginGate } from '../../../src/features/login/useAutoLogin';
import { loginAttempt } from '../../../src/features/login/loginAttempt';
import { testI18n } from '../../../src/__test-utils__/renderWithProviders';
import loginMessages from '../../../src/features/login/Login.i18n.json';
import formMessages from '../../../src/features/login/forms/LoginForm/LoginForm.i18n.json';
import {
  Command_Login_ext,
  Command_RequestPasswordSalt_ext,
  Event_ServerIdentificationSchema,
  Event_ServerIdentification_ServerOptions,
  Event_ServerIdentification_ext,
  Response_LoginSchema,
  Response_Login_ext,
  Response_PasswordSaltSchema,
  Response_PasswordSalt_ext,
  Response_ResponseCode,
  ServerInfo_UserSchema,
} from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { PROTOCOL_VERSION, getMockWebSocket, openMockWebSocket } from '../helpers/setup';
import { buildResponse, buildResponseMessage, buildSessionEventMessage, deliverMessage } from '../helpers/protobuf-builders';
import { findAllSessionCommands, findLastSessionCommand } from '../helpers/command-capture';
import { resetDexie } from '../services/dexie/resetDexie';
import { renderAppScreen, store } from './helpers';

const saltBytes = Buffer.from('0123456789abcdef');
const verifierKey = scryptSync('secret', saltBytes, 64, { N: 1024, r: 8, p: 1 });
const verifier = `$scrypt$1024$8$1$${saltBytes.toString('base64')}$${verifierKey.toString('base64')}`;
const nonce = Uint8Array.from({ length: 32 }, (_, i) => i);

function identifyServer() {
  openMockWebSocket();
  deliverMessage(buildSessionEventMessage(Event_ServerIdentification_ext, create(Event_ServerIdentificationSchema, {
    protocolVersion: PROTOCOL_VERSION,
    serverVersion: '3.1.2',
    serverOptions: Event_ServerIdentification_ServerOptions.SupportsPasswordHash,
    supportsChallengeResponse: true,
  })));
}

async function mountLogin(hashedPassword?: string) {
  const setting = new SettingDTO(APP_USER);
  setting.autoConnect = false;
  setting.signInCardArt = false;
  await setting.save();
  const hostId = Number(await HostDTO.add({
    name: 'Test Server', host: 'server.example', port: '4748', editable: false,
    lastSelected: true, userName: 'alice', remember: true, hashedPassword, supportsHashedPassword: true,
  }));
  await settingsStore.whenReady();
  await knownHostsStore.whenReady();
  const rendered = renderAppScreen(<Login />);
  await waitFor(() => expect(store.getState().server.testConnectionStatus).toBe('testing'));
  await act(async () => identifyServer());
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Save password' })).toBeChecked());
  const password = rendered.container.querySelector<HTMLInputElement>('input[type="password"]')!;
  fireEvent.focus(password);
  fireEvent.change(password, { target: { value: 'secret' } });
  return { hostId, password };
}

async function submitAndChallenge(needsMigration: boolean) {
  const previousSocket = getMockWebSocket();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in and play' }));
  await waitFor(() => expect(getMockWebSocket()).not.toBe(previousSocket));
  await act(async () => {
    identifyServer();
    const request = findLastSessionCommand(Command_RequestPasswordSalt_ext);
    deliverMessage(buildResponseMessage(buildResponse({
      cmdId: request.cmdId,
      ext: Response_PasswordSalt_ext,
      value: create(Response_PasswordSaltSchema, {
        passwordSalt: needsMigration ? 'legacySalt123456' : saltBytes.toString('base64'),
        needsMigration, nonce, n: 1024, r: 8, p: 1,
      }),
    })));
  });
}

beforeAll(() => {
  testI18n.addResourceBundle('en-US', 'translation', {
    ...loginMessages, ...formMessages,
    Common: { label: { username: 'Username', password: 'Password' } },
  }, true, true);
});

beforeEach(async () => {
  vi.useRealTimers();
  await resetDexie();
  settingsStore.reset();
  knownHostsStore.reset();
  autoLoginGate.hasChecked = true;
  loginAttempt.reset();
});

describe('challenge-response login from the sign-in screen', () => {
  it('refuses a typed password with a saved verifier until Save password is unticked', async () => {
    await mountLogin(verifier);
    await submitAndChallenge(true);
    await waitFor(() => expect(store.getState().server.loginLocalFailure).toBe('authenticationDowngrade'));
    expect(store.getState().server.loginFailureCode).toBeNull();
    expect(findAllSessionCommands(Command_Login_ext)).toHaveLength(0);
    expect(screen.getByText(loginMessages.Login.status.authenticationDowngrade)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Save password' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in and play' })).toBeEnabled());
    await submitAndChallenge(true);
    await waitFor(() => expect(findAllSessionCommands(Command_Login_ext)).toHaveLength(1), { timeout: 30000 });
    let legacyHash = Buffer.from('legacySalt123456secret');
    for (let i = 0; i < 1000; i++) {
      legacyHash = createHash('sha512').update(legacyHash).digest();
    }
    const key = `legacySalt123456${legacyHash.toString('base64')}`;
    expect(findLastSessionCommand(Command_Login_ext).value.hashedPassword).toBe(
      `$challenge$${Buffer.from(nonce).toString('base64')}$${createHmac('sha256', key).update(nonce).digest('base64')}`,
    );
  });

  it('does not persist the derived verifier when the server rejects the typed password', async () => {
    const { hostId, password } = await mountLogin();
    const save = vi.spyOn(HostDTO.prototype, 'save');
    try {
      fireEvent.change(password, { target: { value: 'wrong-password' } });
      await submitAndChallenge(false);
      await waitFor(() => expect(findAllSessionCommands(Command_Login_ext)).toHaveLength(1), { timeout: 30000 });
      await act(async () => {
        deliverMessage(buildResponseMessage(buildResponse({
          cmdId: findLastSessionCommand(Command_Login_ext).cmdId,
          responseCode: Response_ResponseCode.RespWrongPassword,
          ext: Response_Login_ext,
          value: create(Response_LoginSchema, { userInfo: create(ServerInfo_UserSchema, { name: 'alice' }) }),
        })));
      });
      expect(store.getState().server.loginFailureCode).toBe(Response_ResponseCode.RespWrongPassword);
      expect(store.getState().server.status.state).toBe(WebsocketTypes.StatusEnum.DISCONNECTED);
      expect(save).not.toHaveBeenCalled();
      expect((await HostDTO.get(hostId))?.hashedPassword).toBeUndefined();
    } finally {
      save.mockRestore();
    }
  });
});
