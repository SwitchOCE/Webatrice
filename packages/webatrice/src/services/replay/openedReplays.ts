import type { WebClient } from '@cockatrice/sockatrice';
import type { GameReplay } from '@cockatrice/sockatrice/generated';

import { ReplayEngine } from './ReplayEngine';

export interface OpenedReplay {
  key: string;
  gameId: number;
  title: string;
  replay: GameReplay;
  engine: ReplayEngine;
}

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

export function getOpenedReplays(): readonly OpenedReplay[] {
  return snapshot;
}

export function subscribeOpenedReplays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
