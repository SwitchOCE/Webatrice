import { getPlaymatSyncState, prunePlaymatSyncState } from './playmatSyncState';

describe('playmatSyncState', () => {
  afterEach(() => {
    prunePlaymatSyncState([]);
  });

  it('keeps one state per game', () => {
    const state = getPlaymatSyncState(1);
    state.rotation = 3;
    expect(getPlaymatSyncState(1)).toBe(state);
    expect(getPlaymatSyncState(2).rotation).toBe(0);
  });

  it('forgets games that are no longer joined', () => {
    getPlaymatSyncState(1).rotation = 3;
    getPlaymatSyncState(2).rotation = 5;
    prunePlaymatSyncState([2]);
    expect(getPlaymatSyncState(1).rotation).toBe(0);
    expect(getPlaymatSyncState(2).rotation).toBe(5);
  });
});
