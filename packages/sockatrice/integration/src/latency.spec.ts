// Command round-trip timing over the wire (Cockatrice #7153): the keepalive
// ping is timed from send to response and the stats reach the session response.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as Data from '../../src/generated';
import { WebsocketTypes } from '../../src/types';

import {
  connectRaw,
  getMockResponse,
  getWebClient,
  installMockWorker,
  uninstallMockWorker,
} from '../../src/testing/setup';
import {
  buildResponse,
  buildResponseMessage,
  deliverMessage,
} from '../../src/testing/protobuf-builders';
import { findLastSessionCommand } from '../../src/testing/command-capture';

describe('round-trip latency', () => {
  beforeAll(() => {
    installMockWorker();
  });

  afterAll(() => {
    uninstallMockWorker();
  });

  it('reports the keepalive ping round trip and zeroes it on disconnect', () => {
    connectRaw();

    vi.advanceTimersByTime(5000);
    const ping = findLastSessionCommand(Data.Command_Ping_ext);
    vi.advanceTimersByTime(85);
    deliverMessage(buildResponseMessage(buildResponse({
      cmdId: ping.cmdId,
      responseCode: Data.Response_ResponseCode.RespOk,
    })));

    const { updateLatencyStats } = getMockResponse().session;
    expect(updateLatencyStats).toHaveBeenLastCalledWith(
      { lastMs: 85, medianMs: 85, p95Ms: 85, maxMs: 85, sampleCount: 1 },
      [85],
    );

    getWebClient().updateStatus(WebsocketTypes.StatusEnum.DISCONNECTED);
    expect(updateLatencyStats).toHaveBeenLastCalledWith(
      { lastMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, sampleCount: 0 },
      [],
    );
  });
});
