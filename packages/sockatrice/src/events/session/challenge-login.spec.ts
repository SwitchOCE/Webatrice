vi.mock('../../WebClient');
vi.mock('../../utils/connectionState', () => ({ consumePendingOptions: vi.fn() }));

import { create, setExtension } from '@bufbuild/protobuf';
import { createHash, createHmac, scryptSync } from 'node:crypto';
import type { Mock } from 'vitest';
import * as Data from '../../generated';
import { WebClient } from '../../WebClient';
import { consumePendingOptions } from '../../utils/connectionState';
import { WebSocketConnectReason } from '../../types/ConnectOptions';
import { StatusEnum } from '../../types/StatusEnum';
import { accountPassword } from '../../commands/session/accountPassword';
import { activate } from '../../commands/session/activate';
import { register } from '../../commands/session/register';
import { serverIdentification } from './serverIdentification';

const send = WebClient.instance.protobuf.sendSessionCommand as Mock;
const target = { host: 'h', port: '1', userName: 'alice' };
const password = 'päss🔑word';
const legacySalt = 'legacySalt000001';
const saltBytes = Buffer.from('0123456789abcdef');
const key = scryptSync(password, saltBytes, 64, { N: 1024, r: 8, p: 1 });
const verifier = `$scrypt$1024$8$1$${saltBytes.toString('base64')}$${key.toString('base64')}`;
const nonce = new Uint8Array([0, 1, 128, 255, 42, 63]);

function legacyHash(salt: string, plain: string): string {
  let bytes = Buffer.from(salt + plain);
  for (let i = 0; i < 1000; i++) {
    bytes = createHash('sha512').update(bytes).digest();
  }
  return salt + bytes.toString('base64');
}

const legacy = legacyHash(legacySalt, password);
const responseFor = (secret: Uint8Array) =>
  `$challenge$${Buffer.from(nonce).toString('base64')}$${createHmac('sha256', secret).update(nonce).digest('base64')}`;
const challenge = (overrides = {}) => create(Data.Response_PasswordSaltSchema, {
  passwordSalt: saltBytes.toString('base64'), scryptSalt: saltBytes.toString('base64'), n: 1024, r: 8, p: 1, nonce, ...overrides,
});
const info = (supportsChallengeResponse = true, serverOptions = 1) => create(Data.Event_ServerIdentificationSchema, {
  protocolVersion: 14, serverOptions, serverVersion: '3.1.2', supportsChallengeResponse,
});
const last = () => send.mock.calls.at(-1)!;
const waitForLogin = () => vi.waitFor(() => expect(last()[0]).toBe(Data.Command_Login_ext));

async function begin(overrides = {}, supportsChallengeResponse = true, serverOptions = 1) {
  (consumePendingOptions as Mock).mockReturnValue({
    ...target, reason: WebSocketConnectReason.LOGIN, password, ...overrides,
  });
  await serverIdentification(info(supportsChallengeResponse, serverOptions));
}

function assertStored(credential: string) {
  last()[2].onSuccess({ buddyList: [], ignoreList: [], missingFeatures: [] });
  expect(WebClient.instance.response.session.loginSuccessful).toHaveBeenCalledWith({ hashedPassword: credential, missingFeatures: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  WebClient.instance.serverSupportsChallengeResponse = false;
  WebClient.instance.connectionGeneration = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('logs in a scrypt row with a typed password and remembers its verifier', async () => {
  await begin();
  expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
  await last()[2].onSuccess(challenge({ passwordSalt: 'legacyBackupSalt' }));
  await waitForLogin();
  expect(last()[1]).toMatchObject({ hashedPassword: responseFor(key), password: '' });
  assertStored(verifier);
});

it('logs in a legacy row with a typed password using the entire legacy hash as HMAC key', async () => {
  await begin();
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt, needsMigration: true }));
  await waitForLogin();
  expect(last()[1].hashedPassword).toBe(responseFor(Buffer.from(legacy)));
  assertStored(legacy);
});

it('logs in a legacy row with a remembered legacy hash', async () => {
  await begin({ password: undefined, hashedPassword: legacy });
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt, needsMigration: true }));
  await waitForLogin();
  expect(last()[1].hashedPassword).toBe(responseFor(Buffer.from(legacy)));
  assertStored(legacy);
});

it('logs in a scrypt row with a remembered verifier without plaintext', async () => {
  await begin({ password: undefined, hashedPassword: verifier });
  await last()[2].onSuccess(challenge());
  await waitForLogin();
  expect(last()[1].hashedPassword).toBe(responseFor(key));
  assertStored(verifier);
});

const unusableCredentials = [legacy, '$scrypt$invalid', '$challenge$old$single-use'];
it.each(unusableCredentials)('requires plaintext for unusable remembered credential %s', async (hashedPassword) => {
  await begin({ password: undefined, hashedPassword });
  await last()[2].onSuccess(challenge());
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledTimes(1));
  expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(undefined, undefined, 'passwordRequired');
  expect(send).toHaveBeenCalledTimes(1);
  expect(WebClient.instance.disconnect).toHaveBeenCalledTimes(1);
  expect(WebClient.instance.response.session.updateStatus).toHaveBeenCalledWith(
    StatusEnum.DISCONNECTED, expect.stringContaining('please enter your password')
  );
});

it('refuses a stored verifier downgrade for remembered login', async () => {
  await begin({ password: undefined, hashedPassword: verifier });
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt, needsMigration: true }));
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledTimes(1));
  expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(undefined, undefined, 'authenticationDowngrade');
  expect(send).toHaveBeenCalledTimes(1);
  expect(WebClient.instance.response.session.updateStatus).toHaveBeenCalledWith(
    StatusEnum.DISCONNECTED, expect.stringContaining('weaker authentication')
  );
});

it('keeps the 3.0 hashed login even if an unknown nonce field arrives', async () => {
  await begin({}, false);
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt }));
  await waitForLogin();
  expect(last()[1]).toMatchObject({ hashedPassword: legacy, password: '' });
});

it('keeps the legacy path when a challenge server supplies no nonce', async () => {
  await begin();
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt, nonce: new Uint8Array() }));
  await waitForLogin();
  expect(last()[1]).toMatchObject({ hashedPassword: legacy, password: '' });
});

it('keeps guest/unregistered login with an empty salt', async () => {
  await begin();
  await last()[2].onSuccess(challenge({ passwordSalt: '' }));
  await waitForLogin();
  expect(last()[1]).toMatchObject({ hashedPassword: '', password });
});

it('refuses unsafe costs locally without submitting or retrying login', async () => {
  await begin();
  await last()[2].onSuccess(challenge({ n: 2 ** 21 }));
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledTimes(1);
});

function assertNewVerifier(value: string) {
  const parts = value.split('$');
  expect(parts.slice(0, 5)).toEqual(['', 'scrypt', '32768', '8', '1']);
  const salt = Buffer.from(parts[5], 'base64');
  expect(salt).toHaveLength(16);
  expect(Buffer.from(parts[6], 'base64')).toEqual(scryptSync(password, salt, 64, {
    N: 32768, r: 8, p: 1, maxmem: 40 * 1024 * 1024,
  }));
}

it('registers a fresh scrypt verifier, then obtains a fresh nonce for auto-login', async () => {
  await begin({ reason: WebSocketConnectReason.REGISTER, email: '', country: '', realName: '' });
  expect(last()[0]).toBe(Data.Command_Register_ext);
  const credential = last()[1].hashedPassword;
  expect(last()[1].password).toBe('');
  assertNewVerifier(credential);
  last()[2].onResponseCode[Data.Response_ResponseCode.RespRegistrationAccepted]();
  expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
  const parts = credential.split('$');
  await last()[2].onSuccess(challenge({ passwordSalt: parts[5], scryptSalt: parts[5], n: 32768 }));
  await waitForLogin();
  expect(last()[1].hashedPassword).toBe(responseFor(Buffer.from(parts[6], 'base64')));
  assertStored(credential);
});

it('activates first, then obtains a fresh nonce and derives the current login key', async () => {
  await begin({ reason: WebSocketConnectReason.ACTIVATE_ACCOUNT, token: 'token' });
  expect(send).toHaveBeenCalledTimes(1);
  expect(last()[0]).toBe(Data.Command_Activate_ext);
  last()[2].onResponseCode[Data.Response_ResponseCode.RespActivationAccepted]();
  expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
  await last()[2].onSuccess(challenge());
  await waitForLogin();
  expect(last()[1].hashedPassword).toBe(responseFor(key));
});

it('resets to a fresh scrypt verifier without reusing the existing account salt', async () => {
  await begin({ reason: WebSocketConnectReason.PASSWORD_RESET, token: 'token', newPassword: password });
  expect(send).toHaveBeenCalledTimes(1);
  expect(last()[0]).toBe(Data.Command_ForgotPasswordReset_ext);
  expect(last()[1].newPassword).toBe('');
  assertNewVerifier(last()[1].hashedNewPassword);
  expect(last()[1].hashedNewPassword.split('$')[5]).not.toBe(saltBytes.toString('base64'));
});

it('changes password to a fresh scrypt verifier while passing the old password for verification', async () => {
  WebClient.instance.serverSupportsChallengeResponse = true;
  await accountPassword('oldPassword', password);
  expect(last()[0]).toBe(Data.Command_AccountPassword_ext);
  expect(last()[1]).toMatchObject({ oldPassword: 'oldPassword', newPassword: '' });
  assertNewVerifier(last()[1].hashedNewPassword);
});

it('reports login rate-limit expiry through loginFailed', async () => {
  await begin({}, false);
  await last()[2].onSuccess(challenge({ passwordSalt: legacySalt }));
  await waitForLogin();
  const raw = create(Data.ResponseSchema, { responseCode: Data.Response_ResponseCode.RespTooManyRequests });
  setExtension(raw, Data.Response_Login_ext, create(Data.Response_LoginSchema, { deniedEndTime: 2000000000n }));
  last()[2].onResponseCode[Data.Response_ResponseCode.RespTooManyRequests](raw);
  expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(Data.Response_ResponseCode.RespTooManyRequests, 2000000000);
  expect(WebClient.instance.disconnect).toHaveBeenCalledTimes(1);
});

it.each([
  { name: 'no nonce', supports: true, options: 1, response: challenge({ nonce: new Uint8Array() }) },
  { name: 'empty salt', supports: true, options: 1, response: challenge({ passwordSalt: '' }) },
  { name: 'no challenge support', supports: false, options: 1, response: challenge() },
  { name: 'no authentication capabilities', supports: false, options: 0, response: undefined },
])('never sends a saved verifier during login with $name', async ({ supports, options, response }) => {
  await begin({ password: undefined, hashedPassword: verifier }, supports, options);
  if (response) {
    await last()[2].onSuccess(response);
  }
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed)
    .toHaveBeenCalledWith(undefined, undefined, 'passwordRequired'));
  expect(send.mock.calls.some(([extension]) => extension === Data.Command_Login_ext)).toBe(false);
  expect(WebClient.instance.response.session.loginSuccessful).not.toHaveBeenCalled();
});

it.each([
  { name: 'no nonce', supports: true, options: 1, response: challenge({ passwordSalt: legacySalt, nonce: new Uint8Array() }) },
  { name: 'no challenge support', supports: false, options: 1, response: challenge({ passwordSalt: legacySalt }) },
  { name: 'empty salt', supports: true, options: 1, response: challenge({ passwordSalt: '' }) },
  { name: 'no authentication capabilities', supports: false, options: 0, response: undefined },
])('uses the typed password with a saved verifier during login with $name', async ({ supports, options, response }) => {
  await begin({ password, hashedPassword: verifier }, supports, options);
  if (response) {
    await last()[2].onSuccess(response);
  }
  await waitForLogin();
  expect(last()[1]).toMatchObject(response?.passwordSalt
    ? { hashedPassword: legacy, password: '' } : { hashedPassword: '', password });
  expect(last()[1].hashedPassword).not.toContain('$scrypt$');
  expect(WebClient.instance.response.session.loginFailed).not.toHaveBeenCalled();
});

const autoLoginFallbacks = [
  { name: 'no nonce', supports: true, response: challenge({ nonce: new Uint8Array() }) },
  { name: 'empty salt', supports: true, response: challenge({ passwordSalt: '' }) },
  { name: 'no challenge support', supports: false, response: undefined },
];

describe.each(['register', 'activate'] as const)('%s auto-login', (action) => {
  it.each(autoLoginFallbacks)('never sends a saved verifier with $name', async ({ supports, response }) => {
    WebClient.instance.serverSupportsChallengeResponse = supports;
    if (action === 'register') {
      register({ ...target, hashedPassword: verifier, email: '', country: '', realName: '' });
      last()[2].onResponseCode[Data.Response_ResponseCode.RespRegistrationAccepted]();
    } else {
      activate({ ...target, token: 'token' }, undefined, verifier);
      last()[2].onResponseCode[Data.Response_ResponseCode.RespActivationAccepted]();
    }
    if (response) {
      expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
      await last()[2].onSuccess(response);
    }
    await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed)
      .toHaveBeenCalledWith(undefined, undefined, 'passwordRequired'));
    expect(send.mock.calls.some(([extension]) => extension === Data.Command_Login_ext)).toBe(false);
    expect(WebClient.instance.response.session.loginSuccessful).not.toHaveBeenCalled();
  });

  it.each(autoLoginFallbacks)('uses the typed password instead of a saved verifier with $name', async ({ supports, response }) => {
    WebClient.instance.serverSupportsChallengeResponse = supports;
    if (action === 'register') {
      register({ ...target, hashedPassword: verifier, email: '', country: '', realName: '' }, password);
      last()[2].onResponseCode[Data.Response_ResponseCode.RespRegistrationAccepted]();
    } else {
      activate({ ...target, token: 'token' }, password, verifier);
      last()[2].onResponseCode[Data.Response_ResponseCode.RespActivationAccepted]();
    }
    if (response) {
      await last()[2].onSuccess(response);
    }
    await waitForLogin();
    expect(last()[1]).toMatchObject(response?.passwordSalt
      ? { hashedPassword: legacyHash(response.passwordSalt, password), password: '' }
      : { hashedPassword: '', password });
    expect(last()[1].hashedPassword).not.toContain('$scrypt$');
    expect(WebClient.instance.response.session.loginFailed).not.toHaveBeenCalled();
  });
});

it.each([true, false])('hashes a legacy row without Web Crypto, nonce present: %s', async (withNonce) => {
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
  await begin();
  expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
  await last()[2].onSuccess(challenge({
    passwordSalt: legacySalt, needsMigration: true, nonce: withNonce ? nonce : new Uint8Array(),
  }));
  await waitForLogin();
  expect(last()[1]).toMatchObject({ hashedPassword: withNonce ? responseFor(Buffer.from(legacy)) : legacy, password: '' });
});

it('keeps plaintext login without Web Crypto on a server without challenge support', async () => {
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
  await begin({}, false);
  expect(send).toHaveBeenCalledTimes(1);
  expect(last()[0]).toBe(Data.Command_Login_ext);
  expect(last()[1]).toMatchObject({ hashedPassword: '', password });
});

it('does not publish credentials after a wrong password', async () => {
  await begin();
  await last()[2].onSuccess(challenge());
  await waitForLogin();
  last()[2].onResponseCode[Data.Response_ResponseCode.RespWrongPassword]({
    responseCode: Data.Response_ResponseCode.RespWrongPassword,
  });
  expect(WebClient.instance.response.session.loginSuccessful).not.toHaveBeenCalled();
  expect(WebClient.instance.response.session.loginFailed).toHaveBeenCalledWith(Data.Response_ResponseCode.RespWrongPassword);
});

it('rejects malformed base64 salt without submitting login', async () => {
  await begin();
  await last()[2].onSuccess(challenge({ scryptSalt: '!invalid-base64!' }));
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed)
    .toHaveBeenCalledWith(undefined, undefined, 'authenticationUnsupported'));
  expect(send).toHaveBeenCalledTimes(1);
});

it.each([true, false])('activation without a password asks for it locally, legacy row: %s', async (needsMigration) => {
  await begin({ reason: WebSocketConnectReason.ACTIVATE_ACCOUNT, token: 'token', password: undefined });
  expect(last()[0]).toBe(Data.Command_Activate_ext);
  last()[2].onResponseCode[Data.Response_ResponseCode.RespActivationAccepted]();
  expect(last()[0]).toBe(Data.Command_RequestPasswordSalt_ext);
  await last()[2].onSuccess(challenge({ needsMigration }));
  await vi.waitFor(() => expect(WebClient.instance.response.session.loginFailed)
    .toHaveBeenCalledWith(undefined, undefined, 'passwordRequired'));
  expect(send.mock.calls.some(([extension]) => extension === Data.Command_Login_ext)).toBe(false);
});
