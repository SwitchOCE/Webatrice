import { create } from '@bufbuild/protobuf';
import * as Data from '../../src/generated';
import { WebsocketTypes } from '../../src/types';
import { StatusEnum } from '../../src/types/StatusEnum';
import { connectAndHandshake, getMockResponse, getMockWebSocket, getWebClient } from '../../src/testing/setup';
import { buildSessionEventMessage, deliverMessage } from '../../src/testing/protobuf-builders';

const R = WebsocketTypes.WebSocketConnectReason;

it.each([
  ['login', { reason: R.LOGIN }],
  ['register', { reason: R.REGISTER, email: 'a@b.test', country: 'AU', realName: 'A', password: 'secret' }],
  ['reset request', { reason: R.PASSWORD_RESET_REQUEST }],
])('keeps the reason from a close event during %s, without reconnecting', async (_name, overrides) => {
  connectAndHandshake(overrides as never);
  await Promise.resolve();
  const socket = getMockWebSocket();

  deliverMessage(buildSessionEventMessage(Data.Event_ConnectionClosed_ext, create(Data.Event_ConnectionClosedSchema, {
    reason: Data.Event_ConnectionClosed_CloseReason.TOO_MANY_CONNECTIONS,
  })));
  expect(getMockResponse().session.updateStatus).toHaveBeenCalledWith(
    StatusEnum.DISCONNECTED,
    'There are too many concurrent connections from your address',
  );
  vi.mocked(getMockResponse().session.updateStatus).mockClear();
  socket.readyState = WebSocket.CLOSED;
  socket.onclose?.({ code: 1000, reason: '', wasClean: true } as CloseEvent);
  vi.advanceTimersByTime(60_000);

  expect(getMockResponse().session.connectionFailed).toHaveBeenCalled();
  expect(getMockResponse().session.updateStatus).not.toHaveBeenCalled();
  expect(getWebClient().status).toBe(StatusEnum.DISCONNECTED);
  expect(getMockWebSocket()).toBe(socket);
  expect(socket.close).toHaveBeenCalled();
});

it('lets the reconnect run when a reset request is cut off by a socket drop', async () => {
  connectAndHandshake({ reason: R.PASSWORD_RESET_REQUEST } as never);
  await Promise.resolve();
  const socket = getMockWebSocket();

  socket.readyState = WebSocket.CLOSED;
  socket.onclose?.({ code: 1006, reason: '', wasClean: false } as CloseEvent);

  expect(getMockResponse().session.resetPasswordFailed).toHaveBeenCalledTimes(1);
  expect(getWebClient().status).toBe(StatusEnum.RECONNECTING);
  vi.advanceTimersByTime(1000);
  expect(getMockWebSocket()).not.toBe(socket);
});
