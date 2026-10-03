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

/**
 * Event counts per 5-second bin, drawn as the activity silhouette behind the
 * timeline. Port of `ReplayTimelineWidget::setTimeline`.
 */
export function createTimelineHistogram(timeline: readonly number[]): number[] {
  const histogram: number[] = [];
  let binEndTime = TIMELINE_BIN_MS - 1;
  let binValue = 0;
  for (const time of timeline) {
    if (time > binEndTime) {
      histogram.push(binValue);
      while (time > binEndTime + TIMELINE_BIN_MS) {
        histogram.push(0);
        binEndTime += TIMELINE_BIN_MS;
      }
      binValue = 1;
      binEndTime += TIMELINE_BIN_MS;
    } else {
      ++binValue;
    }
  }
  histogram.push(binValue);
  return histogram;
}
