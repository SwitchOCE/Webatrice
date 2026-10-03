import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { useSettings } from '@app/hooks';
import {
  BIG_SKIP_MS,
  DEFAULT_FAST_FORWARD_SPEED,
  SMALL_SKIP_MS,
  type OpenedReplay,
  type ReplayPlaybackState,
} from '@app/services';

export interface ReplayPlayback {
  state: ReplayPlaybackState;
  timeline: readonly number[];
  fastForward: boolean;
  fastForwardSpeed: number;
  togglePlay: () => void;
  toggleFastForward: () => void;
  seek: (time: number) => void;
  skipBy: (amount: number) => void;
  setFastForwardSpeed: (speed: number) => void;
  setSkipEmptySections: (value: boolean) => void;
}

const IDLE_STATE: ReplayPlaybackState = {
  currentTime: 0,
  maxTime: 0,
  processedEvents: 0,
  totalEvents: 0,
  playing: false,
  finished: false,
  timeScaleFactor: 1,
  skipEmptySections: false,
};
const NO_TIMELINE: readonly number[] = [];
const subscribeNothing = () => () => {};
const getIdleState = () => IDLE_STATE;

/**
 * Drives an opened replay's playback, desktop's ReplayWidget wiring. The
 * replay's engine and local game belong to the opened replay (see
 * `openReplay`), not to this view: they keep running while the user is on
 * another tab and are only torn down by `closeReplay`. Rewinds reload the game
 * through `WebClient.loadReplayGame` and each recorded container runs through
 * the live game-event pipeline, so the board, log and selectors behave exactly
 * as for a live game.
 */
export function useReplayPlayback(opened: OpenedReplay | undefined): ReplayPlayback {
  const settings = useSettings();
  const engine = opened?.engine ?? null;
  // Coming back to a replay that was fast-forwarding keeps fast-forwarding.
  const [fastForward, setFastForward] = useState(() => (engine?.getState().timeScaleFactor ?? 1) !== 1);

  const state = useSyncExternalStore(engine?.subscribe ?? subscribeNothing, engine?.getState ?? getIdleState);

  const fastForwardSpeed = settings.value?.replayFastForwardSpeed ?? DEFAULT_FAST_FORWARD_SPEED;
  const skipEmptySetting = settings.value?.replaySkipEmptySections ?? false;

  useEffect(() => {
    engine?.setTimeScaleFactor(fastForward ? fastForwardSpeed : 1);
  }, [engine, fastForward, fastForwardSpeed]);

  useEffect(() => {
    engine?.setSkipEmptySections(skipEmptySetting);
  }, [engine, skipEmptySetting]);

  const togglePlay = useCallback(() => engine?.togglePlay(), [engine]);
  const toggleFastForward = useCallback(() => setFastForward((on) => !on), []);
  const seek = useCallback((time: number) => engine?.seek(time), [engine]);
  const skipBy = useCallback((amount: number) => engine?.skipBy(amount), [engine]);

  const { update } = settings;
  const setFastForwardSpeed = useCallback(
    (speed: number) => void update({ replayFastForwardSpeed: speed }),
    [update],
  );
  const setSkipEmptySections = useCallback(
    (value: boolean) => void update({ replaySkipEmptySections: value }),
    [update],
  );

  const scope = { scope: ShortcutScope.REPLAYS, enabled: engine != null };
  useShortcut('replays.playPause', togglePlay, scope);
  useShortcut('replays.toggleFastForward', toggleFastForward, scope);
  useShortcut('replays.skipForward', () => skipBy(SMALL_SKIP_MS), scope);
  useShortcut('replays.skipBackward', () => skipBy(-SMALL_SKIP_MS), scope);
  useShortcut('replays.skipForwardBig', () => skipBy(BIG_SKIP_MS), scope);
  useShortcut('replays.skipBackwardBig', () => skipBy(-BIG_SKIP_MS), scope);

  return {
    state,
    timeline: engine?.timeline ?? NO_TIMELINE,
    fastForward,
    fastForwardSpeed,
    togglePlay,
    toggleFastForward,
    seek,
    skipBy,
    setFastForwardSpeed,
    setSkipEmptySections,
  };
}
