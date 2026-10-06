import { hasExtension } from '@bufbuild/protobuf';
import {
  Event_PlayerPropertiesChanged_ext,
  type GameEventContainer,
  type GameReplay,
} from '@cockatrice/sockatrice/generated';

/**
 * Event number → playback time in ms. Port of desktop `createReplayTimeline`
 * (replay_manager.cpp): containers only carry whole `seconds_elapsed`, so the
 * events recorded within one second are spread evenly across that second.
 */
export function createReplayTimeline(replay: GameReplay): number[] {
  const events = replay.eventList;
  const timeline: number[] = [];
  let lastEventTimestamp = 0;

  for (let i = 0; i < events.length; ++i) {
    let nextSecondIndex = i + 1;
    while (nextSecondIndex < events.length && events[nextSecondIndex].secondsElapsed === lastEventTimestamp) {
      ++nextSecondIndex;
    }

    const numberEventsThisSecond = nextSecondIndex - i;
    for (let k = 0; k < numberEventsThisSecond; ++k) {
      const eventMs = events[i + k].secondsElapsed * 1000;
      const distributionMs = Math.trunc((k / numberEventsThisSecond) * 1000);
      timeline.push(eventMs + distributionMs);
    }

    if (nextSecondIndex < events.length) {
      lastEventTimestamp = events[nextSecondIndex].secondsElapsed;
    }
    i += numberEventsThisSecond - 1;
  }

  return timeline;
}

/**
 * Whether a container changes anything worth watching. Desktop's
 * `hasMeaningfulEvent`: everything but the ~1/s ping-only
 * `Event_PlayerPropertiesChanged` traffic counts.
 */
export function hasMeaningfulEvent(container: GameEventContainer): boolean {
  return container.eventList.some((event) => !hasExtension(event, Event_PlayerPropertiesChanged_ext));
}

/** Width of one timeline histogram bin (desktop `BIN_LENGTH`). */
export const TIMELINE_BIN_MS = 5000;
/** A timestamp must never determine an unbounded allocation or SVG path. */
export const MAX_TIMELINE_BINS = 2048;

/**
 * Event counts per 5-second bin, drawn as the activity silhouette behind the
 * timeline. Long recordings use wider bins to keep memory and rendering bounded.
 */
export function createTimelineHistogram(timeline: readonly number[]): number[] {
  let maxTime = 0;
  for (const time of timeline) {
    if (!Number.isFinite(time) || time < 0) {
      throw new RangeError('Invalid replay timestamp.');
    }
    maxTime = Math.max(maxTime, time);
  }
  const binWidth = Math.max(TIMELINE_BIN_MS, Math.floor(maxTime / MAX_TIMELINE_BINS) + 1);
  const histogram = new Array<number>(Math.floor(maxTime / binWidth) + 1).fill(0);
  for (const time of timeline) {
    ++histogram[Math.floor(time / binWidth)];
  }
  return histogram;
}
