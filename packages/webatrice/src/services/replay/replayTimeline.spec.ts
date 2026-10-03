import { buildReplay, pingContainer, sayContainer } from './__mocks__/fixtures';
import { createReplayTimeline, createTimelineHistogram, hasMeaningfulEvent } from './replayTimeline';

describe('createReplayTimeline', () => {
  it('places each event at its recorded second', () => {
    const replay = buildReplay([sayContainer(0), sayContainer(2), sayContainer(5)]);
    expect(createReplayTimeline(replay)).toEqual([0, 2000, 5000]);
  });

  it('spreads events recorded in the same second evenly across it', () => {
    const replay = buildReplay([sayContainer(0), sayContainer(3), sayContainer(3), sayContainer(3), sayContainer(4)]);
    expect(createReplayTimeline(replay)).toEqual([0, 3000, 3333, 3666, 4000]);
  });

  it('returns an empty timeline for a replay without events', () => {
    expect(createReplayTimeline(buildReplay([]))).toEqual([]);
  });
});

describe('hasMeaningfulEvent', () => {
  it('treats ping-only player property updates as empty', () => {
    expect(hasMeaningfulEvent(pingContainer(1))).toBe(false);
    expect(hasMeaningfulEvent(sayContainer(1))).toBe(true);
  });
});

describe('createTimelineHistogram', () => {
  it('counts events per 5 second bin, including empty bins', () => {
    expect(createTimelineHistogram([0, 1000, 4999, 5000, 16000])).toEqual([3, 1, 0, 1]);
  });

  it('returns a single empty bin for an empty timeline', () => {
    expect(createTimelineHistogram([])).toEqual([0]);
  });
});
