import { create, toBinary } from '@bufbuild/protobuf';
import { GameReplaySchema, ServerInfo_GameSchema } from '@cockatrice/sockatrice/generated';

import { buildReplay, sayContainer } from './__mocks__/fixtures';
import { ReplayParseError, parseReplay, replayFileName } from './parseReplay';

describe('parseReplay', () => {
  it('decodes a serialized GameReplay', () => {
    const bytes = toBinary(GameReplaySchema, buildReplay([sayContainer(0, 'hi'), sayContainer(4)], 12));

    const replay = parseReplay(bytes);

    expect(replay.replayId).toBe(31n);
    expect(replay.gameInfo?.gameId).toBe(12);
    expect(replay.eventList.map((c) => c.secondsElapsed)).toEqual([0, 4]);
  });

  it('rejects bytes that are not protobuf', () => {
    expect(() => parseReplay(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toThrow(ReplayParseError);
  });

  it('rejects an empty file', () => {
    expect(() => parseReplay(new Uint8Array())).toThrow(ReplayParseError);
  });

  it('rejects well-formed protobuf that carries no recorded game', () => {
    const noEvents = toBinary(GameReplaySchema, create(GameReplaySchema, {
      gameInfo: create(ServerInfo_GameSchema, { gameId: 1 }),
    }));
    expect(() => parseReplay(noEvents)).toThrow(ReplayParseError);

    const noGameInfo = toBinary(GameReplaySchema, create(GameReplaySchema, { eventList: [sayContainer(0)] }));
    expect(() => parseReplay(noGameInfo)).toThrow(ReplayParseError);
  });

  it('rejects a text file', () => {
    expect(() => parseReplay(new TextEncoder().encode('1 Island\n1 Forest\n'))).toThrow(ReplayParseError);
  });
});

describe('replayFileName', () => {
  it('names a download like desktop does', () => {
    expect(replayFileName(31n)).toBe('replay_31.cor');
    expect(replayFileName(7)).toBe('replay_7.cor');
  });
});
