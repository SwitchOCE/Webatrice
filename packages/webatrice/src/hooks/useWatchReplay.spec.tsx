import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { toBinary } from '@bufbuild/protobuf';
import { GameReplaySchema } from '@cockatrice/sockatrice/generated';

import { getOpenedReplay, ReplayParseError } from '../services';
import { buildReplay, sayContainer } from '../services/replay/__mocks__/fixtures';
import { useWatchReplay } from './useWatchReplay';

function renderWatchReplay() {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/replays']}>{children}</MemoryRouter>;
  return renderHook(() => ({ watch: useWatchReplay(), location: useLocation() }), { wrapper });
}

describe('useWatchReplay', () => {
  it('parks the decoded replay under a new key and navigates to its replay view', () => {
    const { result } = renderWatchReplay();
    const bytes = toBinary(GameReplaySchema, buildReplay([sayContainer(0)], 12));

    act(() => result.current.watch(bytes, 'final.cor'));

    const replayKey = result.current.location.pathname.match(/^\/replay\/(.+)$/)?.[1];
    const opened = getOpenedReplay(replayKey);
    expect(opened?.title).toBe('final.cor');
    expect(opened?.replay.gameInfo?.gameId).toBe(12);
  });

  it('throws for bytes that are not a replay and stays put', () => {
    const { result } = renderWatchReplay();

    expect(() => result.current.watch(new Uint8Array([1, 2, 3]), 'junk.cor')).toThrow(ReplayParseError);
    expect(result.current.location.pathname).toBe('/replays');
  });
});
