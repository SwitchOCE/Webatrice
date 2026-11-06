import { createHash } from 'node:crypto';
import { create } from '@bufbuild/protobuf';
import * as Data from '../../src/generated';
import { connectAndHandshakeWithSalt, getMockResponse, getMockWebSocket, getWebClient } from '../../src/testing/setup';
import { findLastSessionCommand } from '../../src/testing/command-capture';
import { buildResponse, buildResponseMessage, deliverMessage } from '../../src/testing/protobuf-builders';

const password = 'typed-pässword';
const salt = '0123456789ABCDEF';
const verifier = `$scrypt$1024$8$1$c2FsdA==$${Buffer.alloc(64, 42).toString('base64')}`;
let bytes = Buffer.from(salt + password);
for (let i = 0; i < 1000; i++) {
  bytes = createHash('sha512').update(bytes).digest();
}
const expectedHash = salt + bytes.toString('base64');

it('uses the hashed typed password instead of the saved verifier on a non-challenge server', async () => {
  connectAndHandshakeWithSalt({ password, hashedPassword: verifier });
  const request = findLastSessionCommand(Data.Command_RequestPasswordSalt_ext);
  deliverMessage(buildResponseMessage(buildResponse({
    cmdId: request.cmdId,
    ext: Data.Response_PasswordSalt_ext,
    value: create(Data.Response_PasswordSaltSchema, { passwordSalt: salt }),
  })));
  await vi.waitFor(() => expect(findLastSessionCommand(Data.Command_Login_ext).value.hashedPassword).toBe(expectedHash));
  const login = findLastSessionCommand(Data.Command_Login_ext).value;
  expect(login.password).toBe('');
  expect(JSON.stringify(login)).not.toContain('$scrypt$');
  expect(getMockResponse().session.loginFailed).not.toHaveBeenCalled();
});

it('refuses the saved verifier without a typed password on a non-challenge server', () => {
  connectAndHandshakeWithSalt({ password: undefined, hashedPassword: verifier });
  const request = findLastSessionCommand(Data.Command_RequestPasswordSalt_ext);
  deliverMessage(buildResponseMessage(buildResponse({
    cmdId: request.cmdId,
    ext: Data.Response_PasswordSalt_ext,
    value: create(Data.Response_PasswordSaltSchema, { passwordSalt: salt }),
  })));
  expect(() => findLastSessionCommand(Data.Command_Login_ext)).toThrow();
  expect(getMockResponse().session.loginFailed).toHaveBeenCalledExactlyOnceWith(undefined, undefined, 'passwordRequired');
  expect(getMockWebSocket().close).toHaveBeenCalledTimes(1);
  expect(getWebClient().serverSupportsChallengeResponse).toBe(false);
});
