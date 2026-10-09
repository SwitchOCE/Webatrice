import type { GameEventContainer, GameReplay } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { createReplayTimeline, hasMeaningfulEvent } from './replayTimeline';

/** Playback clock granularity (desktop `TIMER_INTERVAL_MS`). */
export const REPLAY_TICK_MS = 200;
/** Lead-in kept before the next action when skipping an empty section. */
export const EMPTY_SECTION_MARGIN_MS = 500;
/** Desktop `ReplayManager::SMALL_SKIP_MS` / `BIG_SKIP_MS`. */
export const SMALL_SKIP_MS = 1000;
export const BIG_SKIP_MS = 10000;
/** Desktop defaults from `InterfaceSettings` (`replay/*`). */
export const DEFAULT_FAST_FORWARD_SPEED = 10;
export const DEFAULT_REWIND_BUFFERING_MS = 200;
/**
 * Shortest playback timer interval. Browsers clamp short intervals (≥4 ms,
 * about 1 s in a hidden tab), so the clock advances by elapsed wall time rather
 * than by one tick per timer callback; this floor also caps state updates
 * (and timeline repaints) at 20 per second however fast the replay runs.
 */
export const MIN_TICK_INTERVAL_MS = 50;

/**
 * Where replayed events go. `rewind` resets the target game to the replay's
 * starting state; `apply` feeds one recorded container into it.
 */
export interface ReplaySink {
  rewind(): void;
  apply(container: GameEventContainer, options?: WebsocketTypes.ReplayEventOptions): void;
}

export interface ReplayEngineOptions {
  skipEmptySections?: boolean;
  /** Debounce for keyboard-driven backward skips; 0 rewinds immediately. */
  rewindBufferingMs?: number;
}

export interface ReplayPlaybackState {
  /** Time shown on the timeline, in ms. */
  currentTime: number;
  maxTime: number;
  /** Index of the next unprocessed event container. */
  processedEvents: number;
  totalEvents: number;
  playing: boolean;
  finished: boolean;
  timeScaleFactor: number;
  skipEmptySections: boolean;
}

/**
 * Drives a replay the way desktop's `ReplayManager` does: a 200 ms visual clock
 * advances while playing, and every event container whose timeline position has
 * passed is fed to the sink. Seeking forward replays the gap; seeking backward
 * rewinds the game and replays from the start up to the target, since game
 * events cannot be undone. Skip-empty jumps over stretches with nothing but
 * ping updates. Holds no UI and no store: playback state is exposed through
 * `getState` / `subscribe` for `useSyncExternalStore`.
 */
export class ReplayEngine {
  readonly timeline: readonly number[];
  readonly maxTime: number;

  private readonly containers: readonly GameEventContainer[];
  private rewindBufferingMs: number;
  private readonly listeners = new Set<() => void>();

  private skipEmptySections: boolean;
  private timeScaleFactor = 1;
  private currentVisualTime = 0;
  // Events are processed up to this time; it lags the visual time while a
  // buffered rewind is pending.
  private currentProcessedTime = 0;
  private currentEvent = 0;
  private finished = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  // Wall-clock time of the last tick, and replay time owed below one tick.
  private lastTickAt = 0;
  private pendingReplayMs = 0;
  private rewindTimer: ReturnType<typeof setTimeout> | null = null;
  private rewinds = 0;
  private snapshot: ReplayPlaybackState;

  constructor(replay: GameReplay, private readonly sink: ReplaySink, options: ReplayEngineOptions = {}) {
    this.containers = replay.eventList;
    this.timeline = createReplayTimeline(replay);
    this.maxTime = this.timeline.length ? this.timeline[this.timeline.length - 1] : 0;
    this.skipEmptySections = options.skipEmptySections ?? false;
    this.rewindBufferingMs = options.rewindBufferingMs ?? DEFAULT_REWIND_BUFFERING_MS;
    this.snapshot = this.buildSnapshot();
  }

  /** Resets the sink's game to the replay's starting state, at time 0. */
  load(): void {
    this.stopTicking();
    this.currentVisualTime = 0;
    this.processRewind();
    this.emit();
  }

  getState = (): ReplayPlaybackState => this.snapshot;

  /**
   * How many times the game has been rewound. It goes up before the rewind touches the game, so
   * a render that sees the rewound game sees the new count: the board skips the life flash, the
   * damage wash and the tap animation for that render, as desktop's backward skip does
   * (ReplayManager::processNewEvents, SKIP_DAMAGE_ANIMATION and SKIP_TAP_ANIMATION).
   */
  getRewindCount = (): number => this.rewinds;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get isPlaying(): boolean {
    return this.tickTimer !== null;
  }

  play(): void {
    if (this.tickTimer !== null) {
      return;
    }
    this.startTicking();
    this.emit();
  }

  pause(): void {
    this.stopTicking();
    this.emit();
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Playback speed multiplier; desktop's fast-forward sets it to the configured speed. */
  setTimeScaleFactor(factor: number): void {
    this.timeScaleFactor = factor > 0 ? factor : 1;
    if (this.tickTimer !== null) {
      // QTimer::setInterval on a running timer restarts it at the new rate.
      this.stopTicking();
      this.startTicking();
    }
    this.emit();
  }

  setSkipEmptySections(value: boolean): void {
    this.skipEmptySections = value;
    this.emit();
  }

  /** User Interface › Replay "Buffer time for backwards skip"; read at each backward skip, as on desktop. */
  setRewindBufferingMs(ms: number): void {
    this.rewindBufferingMs = ms;
  }

  /** Seek from a timeline click: rewinds immediately when going backwards. */
  seek(time: number): void {
    this.skipToTime(time, false);
  }

  /** Relative skip from the skip buttons/shortcuts; negative skips back. */
  skipBy(amount: number): void {
    this.skipToTime(this.currentVisualTime + amount, amount < 0);
  }

  dispose(): void {
    this.stopTicking();
    this.clearRewindTimer();
    this.listeners.clear();
  }

  private skipToTime(requested: number, doRewindBuffering: boolean): void {
    let newTime = Math.min(Math.max(requested, 0), this.maxTime);
    newTime -= newTime % REPLAY_TICK_MS;

    const isBackwardsSkip = newTime < this.currentProcessedTime;
    this.currentVisualTime = newTime;

    if (isBackwardsSkip) {
      this.handleBackwardsSkip(doRewindBuffering);
    } else {
      this.processNewEvents('forward');
    }
    this.emit();
  }

  /**
   * Backward skips in quick succession (holding the skip key) coalesce into one
   * rewind once the buffer window passes, like desktop's rewindBufferingTimer.
   */
  private handleBackwardsSkip(doRewindBuffering: boolean): void {
    if (doRewindBuffering && this.rewindBufferingMs > 0) {
      this.clearRewindTimer();
      this.rewindTimer = setTimeout(() => {
        this.rewindTimer = null;
        this.processRewind();
        this.emit();
      }, this.rewindBufferingMs);
    } else {
      this.processRewind();
    }
  }

  private processRewind(): void {
    this.clearRewindTimer();
    ++this.rewinds;
    this.currentEvent = 0;
    this.finished = false;
    this.sink.rewind();
    this.processNewEvents('rewind');
  }

  private tick = (): void => {
    const now = Date.now();
    this.pendingReplayMs += (now - this.lastTickAt) * this.timeScaleFactor;
    this.lastTickAt = now;
    // Desktop's clock moves in whole 200 ms steps; keep the rest for the next tick.
    const steps = Math.floor(this.pendingReplayMs / REPLAY_TICK_MS);
    if (steps === 0) {
      return;
    }
    this.pendingReplayMs -= steps * REPLAY_TICK_MS;
    this.currentVisualTime += steps * REPLAY_TICK_MS;
    this.processNewEvents();
    if (this.skipEmptySections) {
      this.handleSkipEmptySection();
    }
    this.emit();
  };

  private processNewEvents(mode: 'playback' | 'forward' | 'rewind' = 'playback'): void {
    this.currentProcessedTime = this.currentVisualTime;

    while (this.currentEvent < this.timeline.length && this.timeline[this.currentEvent] < this.currentProcessedTime) {
      const skipRevealWindow = mode === 'rewind' ||
        (mode === 'forward' && this.currentProcessedTime - this.timeline[this.currentEvent] > BIG_SKIP_MS);
      this.sink.apply(this.containers[this.currentEvent], { skipRevealWindow });
      ++this.currentEvent;
    }
    if (this.currentEvent === this.timeline.length) {
      this.finished = true;
      this.stopTicking();
    }
  }

  private handleSkipEmptySection(): void {
    if (this.currentEvent === this.timeline.length) {
      return;
    }

    let prevEvent = Math.max(0, this.currentEvent - 1);
    while (prevEvent > 0 && !hasMeaningfulEvent(this.containers[prevEvent])) {
      --prevEvent;
    }
    if (this.currentVisualTime - this.timeline[prevEvent] <= EMPTY_SECTION_MARGIN_MS) {
      return;
    }

    let nextEvent = this.currentEvent;
    while (nextEvent < this.timeline.length - 1 && !hasMeaningfulEvent(this.containers[nextEvent])) {
      ++nextEvent;
    }
    const nextEventTime = this.timeline[nextEvent];
    if (nextEventTime - this.currentVisualTime <= EMPTY_SECTION_MARGIN_MS) {
      return;
    }

    this.skipToTime(nextEventTime - EMPTY_SECTION_MARGIN_MS, false);
  }

  private startTicking(): void {
    const interval = Math.max(MIN_TICK_INTERVAL_MS, Math.round(REPLAY_TICK_MS / this.timeScaleFactor));
    this.lastTickAt = Date.now();
    this.pendingReplayMs = 0;
    this.tickTimer = setInterval(this.tick, interval);
  }

  private stopTicking(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private clearRewindTimer(): void {
    if (this.rewindTimer !== null) {
      clearTimeout(this.rewindTimer);
      this.rewindTimer = null;
    }
  }

  private buildSnapshot(): ReplayPlaybackState {
    return {
      currentTime: Math.min(this.currentVisualTime, this.maxTime),
      maxTime: this.maxTime,
      processedEvents: this.currentEvent,
      totalEvents: this.timeline.length,
      playing: this.tickTimer !== null,
      finished: this.finished,
      timeScaleFactor: this.timeScaleFactor,
      skipEmptySections: this.skipEmptySections,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }
}
