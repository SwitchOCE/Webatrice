import { buildReplay, sayContainer } from './__mocks__/fixtures';
import { closeReplay, getOpenedReplay, openReplay } from './openedReplays';

describe('openedReplays', () => {
  it('parks a replay under a fresh key with its own negative game id', () => {
    const first = openReplay(buildReplay([sayContainer(0)]), 'one.cor');
    const second = openReplay(buildReplay([sayContainer(0)]), 'two.cor');

    expect(first).not.toBe(second);
    expect(getOpenedReplay(first)).toMatchObject({ key: first, title: 'one.cor' });
    expect(getOpenedReplay(first)!.gameId).toBeLessThan(0);
    expect(getOpenedReplay(first)!.gameId).not.toBe(getOpenedReplay(second)!.gameId);
  });

  it('forgets a closed replay', () => {
    const key = openReplay(buildReplay([sayContainer(0)]), 'gone.cor');
    closeReplay(key);
    expect(getOpenedReplay(key)).toBeUndefined();
    expect(getOpenedReplay(undefined)).toBeUndefined();
  });
});
