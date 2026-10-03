import { act, renderHook, waitFor } from '@testing-library/react';

import type { BracketAssessment } from '@app/types';

import { analyzeBracket, deckFingerprint, type BracketAnalysis } from '../bracket';
import type { DeckCard } from '../types';
import { useBracketAssessment } from './useBracketAssessment';

vi.mock('../bracket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../bracket')>()),
  analyzeBracket: vi.fn(),
}));

const cards: DeckCard[] = [{ name: 'Sol Ring', quantity: 1, category: 'main', lookupSource: 'scryfall' }];

const signals = {
  turns: { matches: [], restricted: [] },
  denial: { matches: [], restricted: [] },
  gameChangers: { matches: [] },
  earlyCombos: [],
  lateCombos: [],
};
const complete: BracketAnalysis = { report: { level: 1, signals }, unavailable: [] };
const degraded: BracketAnalysis = {
  report: { level: 2, signals },
  unavailable: [{ source: 'combos', failure: { kind: 'timeout' } }],
};

describe('useBracketAssessment', () => {
  it('uses a cached assessment that still matches the deck without analysing or persisting', () => {
    const cached: BracketAssessment = {
      level: 4, fingerprint: deckFingerprint(cards), gameChangers: [], turns: [], turnsRestricted: [],
      denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
    };
    const persist = vi.fn();
    const { result } = renderHook(() => useBracketAssessment(cards, cached, persist));

    expect(result.current).toEqual(expect.objectContaining({ status: 'complete' }));
    expect(result.current.status === 'complete' && result.current.report.level).toBe(4);
    expect(analyzeBracket).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists a complete analysis with the deck fingerprint', async () => {
    vi.mocked(analyzeBracket).mockResolvedValue(complete);
    const persist = vi.fn();
    const { result } = renderHook(() => useBracketAssessment(cards, undefined, persist));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ level: 1, fingerprint: deckFingerprint(cards) }));
  });

  it('reports a degraded analysis without persisting it, and retries on demand', async () => {
    vi.mocked(analyzeBracket).mockResolvedValue(degraded);
    const persist = vi.fn();
    const { result } = renderHook(() => useBracketAssessment(cards, undefined, persist));

    await waitFor(() => expect(result.current.status).toBe('degraded'));
    expect(result.current).toEqual(expect.objectContaining({ unavailable: degraded.unavailable }));
    expect(persist).toHaveBeenCalledWith(undefined);
    expect(persist).not.toHaveBeenCalledWith(expect.objectContaining({ level: 2 }));

    vi.mocked(analyzeBracket).mockResolvedValue(complete);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(analyzeBracket).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ level: 1 }));
  });

  it('reports an unexpected failure and clears the persisted assessment', async () => {
    vi.mocked(analyzeBracket).mockRejectedValue(new Error('boom'));
    const persist = vi.fn();
    const { result } = renderHook(() => useBracketAssessment(cards, undefined, persist));

    await waitFor(() => expect(result.current).toEqual(expect.objectContaining({ status: 'error', message: 'boom' })));
    expect(persist).toHaveBeenCalledWith(undefined);
  });
});
