import type { GameReplay } from '@cockatrice/sockatrice/generated';

/**
 * Replays opened for watching in this tab, keyed for the `/replay/:replayKey`
 * route. The replays screen decodes a `.cor` (picked file, local library entry
 * or server download) and parks it here; the replay view picks it up by key.
 * In memory only, like a desktop replay tab: a reload drops it.
 */
export interface OpenedReplay {
  key: string;
  /**
   * Id of the local game the replay is played into. Negative, so it can never
   * collide with a Servatrice game id; Datatrice flags the entry as a replay.
   */
  gameId: number;
  /** Tab/heading label, e.g. the file name or the server match name. */
  title: string;
  replay: GameReplay;
}

const REPLAY_GAME_ID_BASE = -1000;

const opened = new Map<string, OpenedReplay>();
let nextKey = 1;

export function openReplay(replay: GameReplay, title: string): string {
  const serial = nextKey++;
  const key = String(serial);
  opened.set(key, { key, gameId: REPLAY_GAME_ID_BASE - serial, title, replay });
  return key;
}

export function getOpenedReplay(key: string | undefined): OpenedReplay | undefined {
  return key != null ? opened.get(key) : undefined;
}

export function closeReplay(key: string): void {
  opened.delete(key);
}
