import { fromBinary, isFieldSet } from '@bufbuild/protobuf';
import { BinaryReader, WireType } from '@bufbuild/protobuf/wire';
import { GameEventContainerSchema, GameReplaySchema, type GameReplay } from '@cockatrice/sockatrice/generated';

/** Desktop's replay file extension (`REPLAY_FILE_NAME_FILTERS`). */
export const REPLAY_FILE_EXTENSION = '.cor';
/** Shared by file picking and decoding (downloads and stored bytes bypass picking). */
export const MAX_REPLAY_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_REPLAY_EVENT_CONTAINERS = 100_000;
export const MAX_REPLAY_EVENTS = 100_000;

export class ReplayParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ReplayParseError';
  }
}

/**
 * Decodes a `.cor` replay: the serialized `GameReplay` message, exactly what
 * desktop writes to disk and what `Response_ReplayDownload.replay_data` carries.
 * Protobuf decoding accepts most byte strings, so a replay is only accepted when
 * it carries the recorded game's info and at least one event container.
 */
export function parseReplay(bytes: Uint8Array): GameReplay {
  if (bytes.byteLength > MAX_REPLAY_FILE_BYTES) {
    throw new ReplayParseError('The replay file is too large.');
  }
  let replay: GameReplay;
  try {
    // Count before decoding: many empty messages can expand a small file into
    // a large object graph. skip() reads length-delimited data without copying.
    const reader = new BinaryReader(bytes);
    let containers = 0;
    let events = 0;
    while (reader.pos < reader.len) {
      const [field, wireType] = reader.tag();
      // Replays contain no protobuf groups; do not recursively skip crafted ones.
      if (wireType === WireType.StartGroup || wireType === WireType.EndGroup) {
        throw new ReplayParseError('The file is not a Cockatrice replay.');
      }
      if (field === GameReplaySchema.field.eventList.number) {
        if (++containers > MAX_REPLAY_EVENT_CONTAINERS) {
          throw new ReplayParseError('The replay has too many event containers.');
        }
        if (wireType !== WireType.LengthDelimited) {
          throw new ReplayParseError('The file is not a Cockatrice replay.');
        }
        const container = new BinaryReader(reader.bytes());
        while (container.pos < container.len) {
          const [containerField, containerWireType] = container.tag();
          if (containerWireType === WireType.StartGroup || containerWireType === WireType.EndGroup) {
            throw new ReplayParseError('The file is not a Cockatrice replay.');
          }
          if (containerField === GameEventContainerSchema.field.eventList.number && ++events > MAX_REPLAY_EVENTS) {
            throw new ReplayParseError('The replay has too many events.');
          }
          container.skip(containerWireType, containerField);
        }
      } else {
        reader.skip(wireType, field);
      }
    }
    replay = fromBinary(GameReplaySchema, bytes);
  } catch (cause) {
    if (cause instanceof ReplayParseError) {
      throw cause;
    }
    throw new ReplayParseError('The file is not a Cockatrice replay.', { cause });
  }
  if (!isFieldSet(replay, GameReplaySchema.field.gameInfo) || replay.eventList.length === 0) {
    throw new ReplayParseError('The file is not a Cockatrice replay.');
  }
  return replay;
}

/** `replay_<id>.cor`, desktop's name for a downloaded replay (TabReplays::downloadNodeAtIndex). */
export function replayFileName(replayId: number | bigint): string {
  return `replay_${replayId}${REPLAY_FILE_EXTENSION}`;
}
