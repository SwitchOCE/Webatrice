import { create } from '@bufbuild/protobuf';
import * as Data from '../../src/generated';
import * as utils from '../../src/utils';
import { WebClient } from '../../src/WebClient';
import { StatusEnum } from '../../src/types/StatusEnum';
import { loginWithFreshSalt } from '../../src/commands/session/loginWithChallenge';
import {
  connectRaw, createWebClientForTest, getMockResponse, getMockWebSocket, getWebClient, openMockWebSocket,
} from '../../src/testing/setup';
import { findLastSessionCommand } from '../../src/testing/command-capture';
import { buildResponse, buildResponseMessage, buildSessionEventMessage, deliverMessage } from '../../src/testing/protobuf-builders';

function identifyServer(supportsChallengeResponse = true) {
  deliverMessage(buildSessionEventMessage(Data.Event_ServerIdentification_ext, create(Data.Event_ServerIdentificationSchema, {
    protocolVersion: 14, serverOptions: 1, supportsChallengeResponse,
  })));
}

function beginDerivation() {
  let resolve!: (value: { hashedPassword: string; credential: string }) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<{ hashedPassword: string; credential: string }>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  const prepare = vi.spyOn(utils, 'prepareChallengeLogin').mockReturnValueOnce(pending);
  connectRaw();
  identifyServer();
  const salt = findLastSessionCommand(Data.Command_RequestPasswordSalt_ext);
  deliverMessage(buildResponseMessage(buildResponse({
    cmdId: salt.cmdId,
    ext: Data.Response_PasswordSalt_ext,
    value: create(Data.Response_PasswordSaltSchema, {
      passwordSalt: 'c2FsdA==', n: 1024, r: 8, p: 1, nonce: new Uint8Array([1, 2, 3]),
    }),
  })));
  expect(prepare).toHaveBeenCalledTimes(1);
  return { pending, resolve, reject };
}

it.each(['resolve', 'reject'] as const)('ignores a superseded key derivation that later %ss', async (outcome) => {
  const { pending, resolve, reject } = beginDerivation();
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

it('ignores key derivation after teardown', async () => {
  const { pending, reject } = beginDerivation();
  const previousResponse = getMockResponse();
  WebClient.dispose();
  createWebClientForTest();
  connectRaw({ host: 'new-server', userName: 'bob' });
  const socket = getMockWebSocket();
  reject(new Error('Key derivation failed'));
  await pending.catch(() => undefined);
  await Promise.resolve();
  expect(previousResponse.session.loginFailed).not.toHaveBeenCalled();
  expect(getMockResponse().session.loginFailed).not.toHaveBeenCalled();
  expect(socket.send).not.toHaveBeenCalled();
  expect(socket.close).not.toHaveBeenCalled();
});

it.each(['legacy', 'challenge', 'fresh'] as const)('settles %s salt login when the socket closes', (path) => {
  connectRaw();
  if (path === 'fresh') {
    loginWithFreshSalt({ host: 'localhost', port: '4748', userName: 'alice' }, 'password');
  } else {
    identifyServer(path === 'challenge');
  }
  expect(findLastSessionCommand(Data.Command_RequestPasswordSalt_ext).value.userName).toBe('alice');
  const socket = getMockWebSocket();
  socket.readyState = WebSocket.CLOSED;
  socket.onclose?.({ code: 1006, reason: '', wasClean: false } as CloseEvent);
  expect(getMockResponse().session.loginFailed).toHaveBeenCalledExactlyOnceWith();
  expect(getWebClient().status).toBe(StatusEnum.RECONNECTING);
  expect(socket.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(getMockWebSocket()).not.toBe(socket);
});

it.each(['resolve', 'reject'] as const)('settles a socket drop during key derivation that later %ss', async (outcome) => {
  const { pending, resolve, reject } = beginDerivation();
  const generation = getWebClient().connectionGeneration;
  const socket = getMockWebSocket();
  socket.readyState = WebSocket.CLOSED;
  socket.onclose?.({ code: 1006, reason: '', wasClean: false } as CloseEvent);
  expect(getMockResponse().session.loginFailed).toHaveBeenCalledExactlyOnceWith();
  expect(getWebClient().status).toBe(StatusEnum.RECONNECTING);
  expect(getWebClient().connectionGeneration).toBe(generation);
  vi.advanceTimersByTime(1000);
  openMockWebSocket();
  const reconnectedSocket = getMockWebSocket();
  expect(reconnectedSocket).not.toBe(socket);
  if (outcome === 'resolve') {
    resolve({ hashedPassword: '$challenge$old$reply', credential: '$scrypt$stored' });
  } else {
    reject(new Error('Key derivation failed'));
  }
  await pending.catch(() => undefined);
  await Promise.resolve();
  expect(getMockResponse().session.loginFailed).toHaveBeenCalledTimes(1);
  expect(reconnectedSocket.send).not.toHaveBeenCalled();
  expect(reconnectedSocket.close).not.toHaveBeenCalled();
  expect(getWebClient().status).toBe(StatusEnum.CONNECTED);
});
