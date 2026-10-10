import { useCallback, useEffect, useRef, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { useWebClient } from '@cockatrice/datatrice/react';
import type { GameReplay } from '@cockatrice/sockatrice/generated';
import {
  ReplayEngine,
  getOpenedReplay,
  openReplay,
  parseReplay,
  type OpenedReplay,
  type ReplayGameTarget,
} from '@app/services';
import { RouteEnum } from '@app/types';

export interface PreviewSource {
  key: string;
  title: string;
  fetch: () => Promise<Uint8Array>;
}

export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReplayPreviewState {
  status: PreviewStatus;
  key: string | null;
  opened: OpenedReplay | undefined;
  error: string | null;
  load: (source: PreviewSource) => void;
  reset: () => void;
  watchFrom: (time: number) => void;
}

export const PREVIEW_CACHE_SIZE = 8;
const PREVIEW_GAME_ID_BASE = -100000;

const parsedReplays = new Map<string, GameReplay>();
let nextPreviewSerial = 1;

export function cachedReplay(key: string): GameReplay | undefined {
  return parsedReplays.get(key);
}

export function rememberReplay(key: string, replay: GameReplay): void {
  parsedReplays.delete(key);
  parsedReplays.set(key, replay);
  while (parsedReplays.size > PREVIEW_CACHE_SIZE) {
    parsedReplays.delete(parsedReplays.keys().next().value!);
  }
}

export function clearReplayCache(): void {
  parsedReplays.clear();
}

export function createPreviewReplay(key: string, replay: GameReplay, title: string, target: ReplayGameTarget): OpenedReplay {
  const gameId = PREVIEW_GAME_ID_BASE - nextPreviewSerial++;
  const gameInfo = replay.gameInfo!;
  const engine = new ReplayEngine(replay, {
    rewind: () => target.loadReplayGame(gameId, gameInfo),
    apply: (container, options) => target.replayGameEventContainer(container, gameId, options),
  });
  engine.load();
  return { key, gameId, title, replay, engine };
}

export function useReplayPreview(): ReplayPreviewState {
  const webClient = useWebClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [key, setKey] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenedReplay | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const openedRef = useRef<OpenedReplay | undefined>(undefined);
  const requestRef = useRef(0);

  const dispose = useCallback(() => {
    const current = openedRef.current;
    if (current) {
      current.engine.dispose();
      webClient.unloadReplayGame(current.gameId);
      openedRef.current = undefined;
    }
    requestRef.current += 1;
  }, [webClient]);

  useEffect(() => dispose, [dispose]);

  const reset = useCallback(() => {
    dispose();
    setOpened(undefined);
    setKey(null);
    setError(null);
    setStatus('idle');
  }, [dispose]);

  const load = useCallback((source: PreviewSource) => {
    dispose();
    const request = requestRef.current;
    setOpened(undefined);
    setKey(source.key);
    setError(null);
    setStatus('loading');
    const ready = (replay: GameReplay) => {
      if (requestRef.current !== request) {
        return;
      }
      const preview = createPreviewReplay(source.key, replay, source.title, webClient);
      openedRef.current = preview;
      setOpened(preview);
      setStatus('ready');
    };
    const cached = cachedReplay(source.key);
    if (cached) {
      ready(cached);
      return;
    }
    source.fetch()
      .then((bytes) => {
        const replay = parseReplay(bytes);
        rememberReplay(source.key, replay);
        ready(replay);
      })
      .catch((err: unknown) => {
        if (requestRef.current !== request) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  }, [dispose, webClient]);

  const watchFrom = useCallback((time: number) => {
    const current = openedRef.current;
    if (!current) {
      return;
    }
    current.engine.pause();
    const replayKey = openReplay(current.replay, current.title, webClient);
    getOpenedReplay(replayKey)?.engine.seek(time);
    navigate(generatePath(RouteEnum.REPLAY, { replayKey }));
  }, [navigate, webClient]);

  return { status, key, opened, error, load, reset, watchFrom };
}
