import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { create, hasExtension, toBinary } from '@bufbuild/protobuf';
import { BinaryWriter, WireType } from '@bufbuild/protobuf/wire';
import {
  Event_GameClosed_ext,
  Event_Join_ext,
  GameEventContainerSchema,
  GameReplaySchema,
  ServerInfo_GameSchema,
} from '@cockatrice/sockatrice/generated';

import { buildReplay, sayContainer } from './__mocks__/fixtures';
import { ReplayParseError, parseReplay, replayFileName } from './parseReplay';

describe('parseReplay', () => {
  it('rejects oversized bytes at the decoder boundary, including server downloads', () => {
    const bytes = new Uint8Array(32 * 1024 * 1024 + 2);
    // Valid repeated duration fields: the old decoder accepts this tiny-object bomb.
    for (let i = 0; i < bytes.length; i += 2) {
      bytes[i] = 32;
    }
    bytes.set(toBinary(GameReplaySchema, buildReplay([sayContainer(0)])));
    expect(() => parseReplay(bytes)).toThrow(/too large/);
  });

  it('rejects too many containers before constructing protobuf objects', () => {
    const writer = new BinaryWriter();
    writer.tag(GameReplaySchema.field.gameInfo.number, WireType.LengthDelimited).bytes(new Uint8Array());
    for (let i = 0; i <= 100_000; ++i) {
      writer.tag(GameReplaySchema.field.eventList.number, WireType.LengthDelimited).bytes(new Uint8Array());
    }
    expect(() => parseReplay(writer.finish())).toThrow(/too many event containers/);
  });

  it('bounds events inside containers too, including many events in a small file', () => {
    const container = new BinaryWriter();
    for (let i = 0; i <= 50_000; ++i) {
      container.tag(GameEventContainerSchema.field.eventList.number, WireType.LengthDelimited).bytes(new Uint8Array());
    }
    const payload = container.finish();
    const writer = new BinaryWriter();
    writer.tag(GameReplaySchema.field.gameInfo.number, WireType.LengthDelimited).bytes(new Uint8Array());
    for (let i = 0; i < 2; ++i) {
      writer.tag(GameReplaySchema.field.eventList.number, WireType.LengthDelimited).bytes(payload);
    }
    expect(() => parseReplay(writer.finish())).toThrow(/too many events/);
  });

  it('decodes a .cor recorded by Servatrice', () => {
    // Saved from the replays tab after e2e/specs/replays.spec.ts played a game.
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, '__mocks__/two-player-game.cor')));

    const replay = parseReplay(bytes);
    const events = replay.eventList.flatMap((container) => container.eventList);

    expect(replay.replayId).toBeGreaterThan(0n);
    expect(replay.gameInfo?.description).toMatch(/^replay-/);
    expect(replay.gameInfo?.maxPlayers).toBe(2);
    // Servatrice clears game_id on every stored container.
    expect(replay.eventList.every((container) => container.gameId === 0)).toBe(true);
    expect(events.filter((event) => hasExtension(event, Event_Join_ext))).toHaveLength(2);
    expect(hasExtension(events.at(-1)!, Event_GameClosed_ext)).toBe(true);
  });

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
