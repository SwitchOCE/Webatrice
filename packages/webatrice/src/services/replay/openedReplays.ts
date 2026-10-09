import type { WebClient } from '@cockatrice/sockatrice';
import type { GameReplay } from '@cockatrice/sockatrice/generated';

import { ReplayEngine } from './ReplayEngine';

/**
 * Replays opened for watching, desktop's replay TabGames. The replays screen
 * decodes a `.cor` (picked file, local library entry or server download) and
 * opens it here; each one keeps its local game and its playback engine until
 * the user closes it, so leaving the replay view and coming back resumes where
 * it was, like switching away from a desktop replay tab. In memory only: a
 * reload drops them.
 */
export interface OpenedReplay {
  /** Key of the `/replay/:replayKey` route and the replay's top-bar tab. */
  key: string;
  /**
   * Id of the local game the replay is played into. Negative, so it can never
   * collide with a Servatrice game id; Datatrice flags the entry as a replay.
   */
  gameId: number;
  /** Tab/heading label, e.g. the file name or the server match name. */
  title: string;
  replay: GameReplay;
  engine: ReplayEngine;
}

/** The WebClient entry points a replay is played through; nothing reaches the server. */
export type ReplayGameTarget = Pick<WebClient, 'loadReplayGame' | 'unloadReplayGame' | 'replayGameEventContainer'>;

const REPLAY_GAME_ID_BASE = -1000;

const opened = new Map<string, { entry: OpenedReplay; target: ReplayGameTarget }>();
const listeners = new Set<() => void>();
let snapshot: readonly OpenedReplay[] = [];
let nextKey = 1;

function changed(): void {
  snapshot = [...opened.values()].map(({ entry }) => entry);
  listeners.forEach((listener) => listener());
}

/**
 * Opens `replay` into a fresh local game and loads it at time 0. Returns the
 * key of its route and tab.
 */
export function openReplay(replay: GameReplay, title: string, target: ReplayGameTarget): string {
  const serial = nextKey++;
  const key = String(serial);
  const gameId = REPLAY_GAME_ID_BASE - serial;
  const gameInfo = replay.gameInfo!;
  const engine = new ReplayEngine(replay, {
    rewind: () => target.loadReplayGame(gameId, gameInfo),
    apply: (container, options) => target.replayGameEventContainer(container, gameId, options),
  });
  engine.load();
  opened.set(key, { entry: { key, gameId, title, replay, engine }, target });
  changed();
  return key;
}

export function getOpenedReplay(key: string | undefined): OpenedReplay | undefined {
  return key != null ? opened.get(key)?.entry : undefined;
}

/** Stops the replay, removes its local game and forgets it (desktop's "Close replay"). */
export function closeReplay(key: string): void {
  const record = opened.get(key);
  if (!record) {
    return;
  }
  record.entry.engine.dispose();
  record.target.unloadReplayGame(record.entry.gameId);
  opened.delete(key);
  changed();
}

/** Open replays in opening order; a new array only when the set changes (`useSyncExternalStore`). */
export function getOpenedReplays(): readonly OpenedReplay[] {
  return snapshot;
}

export function subscribeOpenedReplays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
