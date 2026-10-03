import { fromBinary, isFieldSet } from '@bufbuild/protobuf';
import { GameReplaySchema, type GameReplay } from '@cockatrice/sockatrice/generated';

/** Desktop's replay file extension (`REPLAY_FILE_NAME_FILTERS`). */
export const REPLAY_FILE_EXTENSION = '.cor';

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
  let replay: GameReplay;
  try {
    replay = fromBinary(GameReplaySchema, bytes);
  } catch (cause) {
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
