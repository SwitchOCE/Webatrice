import { create } from '@bufbuild/protobuf';
import * as Data from '../../src/generated';
import * as utils from '../../src/utils';
import { loginWithFreshSalt } from '../../src/commands/session/loginWithChallenge';
import { connectRaw, getMockResponse, getMockWebSocket, getWebClient } from '../../src/testing/setup';
import { findLastSessionCommand } from '../../src/testing/command-capture';
import { buildResponse, buildResponseMessage, buildSessionEventMessage, deliverMessage } from '../../src/testing/protobuf-builders';

it.each(['resolve', 'reject'] as const)('ignores a superseded key derivation that later %ss', async (outcome) => {
  let resolve!: (value: { hashedPassword: string; credential: string }) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<{ hashedPassword: string; credential: string }>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  const prepare = vi.spyOn(utils, 'prepareChallengeLogin').mockReturnValueOnce(pending);
  connectRaw();
  deliverMessage(buildSessionEventMessage(Data.Event_ServerIdentification_ext, create(Data.Event_ServerIdentificationSchema, {
    protocolVersion: 14, serverOptions: 1, supportsChallengeResponse: true,
  })));
  const salt = findLastSessionCommand(Data.Command_RequestPasswordSalt_ext);
  deliverMessage(buildResponseMessage(buildResponse({
    cmdId: salt.cmdId,
    ext: Data.Response_PasswordSalt_ext,
    value: create(Data.Response_PasswordSaltSchema, {
      passwordSalt: 'c2FsdA==', n: 1024, r: 8, p: 1, nonce: new Uint8Array([1, 2, 3]),
    }),
  })));
  expect(prepare).toHaveBeenCalledTimes(1);
  const previousGeneration = getWebClient().connectionGeneration;
  connectRaw({ host: 'new-server', userName: 'bob' });
  const currentSocket = getMockWebSocket();
  expect(getWebClient().connectionGeneration).toBeGreaterThan(previousGeneration);
  if (outcome === 'resolve') {
    resolve({ hashedPassword: '$challenge$old$reply', credential: '$scrypt$stored' });
  } else {
    reject(new Error('Key derivation failed'));
  }
  await pending.catch(() => undefined);
  await Promise.resolve();
  expect(currentSocket.send).not.toHaveBeenCalled();
  expect(currentSocket.close).not.toHaveBeenCalled();
  expect(getMockResponse().session.loginFailed).not.toHaveBeenCalled();
  expect(getMockResponse().session.loginSuccessful).not.toHaveBeenCalled();
});

it('ignores a fresh-salt request cancelled by a new connect', () => {
  connectRaw();
  loginWithFreshSalt({ host: 'localhost', port: '4748', userName: 'alice' }, 'password');
  expect(findLastSessionCommand(Data.Command_RequestPasswordSalt_ext).value.userName).toBe('alice');
  connectRaw({ host: 'new-server', userName: 'bob' });
  expect(getMockResponse().session.loginFailed).not.toHaveBeenCalled();
  expect(getMockWebSocket().send).not.toHaveBeenCalled();
  expect(getMockWebSocket().close).not.toHaveBeenCalled();
});
