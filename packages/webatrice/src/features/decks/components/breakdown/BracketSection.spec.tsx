import { fireEvent, render, screen } from '@testing-library/react';

import { BRACKET_LOOKUPS_STORAGE_KEY, writeBracketLookupsAllowed } from '../../bracketConsent';
import { useBracketAssessment } from '../../hooks/useBracketAssessment';
import { BracketSection } from './BracketSection';

vi.mock('../../hooks/useBracketAssessment', () => ({ useBracketAssessment: vi.fn() }));

const signals = {
  turns: { matches: ['Time Warp'], restricted: [] },
  denial: { matches: [], restricted: [] },
  gameChangers: { matches: [] },
  earlyCombos: [],
  lateCombos: [],
};

afterEach(() => {
  window.localStorage.clear();
});

describe('BracketSection', () => {
  it('asks before any third-party lookup, and remembers the opt-in', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({ status: 'consentRequired', retry: vi.fn() });
    render(<BracketSection cards={[]} />);

    expect(screen.getByText('DeckBracket.consent.prompt')).toBeInTheDocument();
    expect(vi.mocked(useBracketAssessment).mock.lastCall?.[3]).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /DeckBracket\.consent\.allow/ }));
    expect(window.localStorage.getItem(BRACKET_LOOKUPS_STORAGE_KEY)).toBe('true');
    expect(vi.mocked(useBracketAssessment).mock.lastCall?.[3]).toBe(true);
  });

  it('lets the user turn the lookups off again', () => {
    writeBracketLookupsAllowed(true);
    vi.mocked(useBracketAssessment).mockReturnValue({
      status: 'complete',
      report: { level: 2, signals },
      retry: vi.fn(),
    });
    render(<BracketSection cards={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'DeckBracket.consent.revoke' }));
    expect(window.localStorage.getItem(BRACKET_LOOKUPS_STORAGE_KEY)).toBe('false');
    expect(vi.mocked(useBracketAssessment).mock.lastCall?.[3]).toBe(false);
  });

  it('shows progress while assessing', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({ status: 'loading', retry: vi.fn() });
    render(<BracketSection cards={[]} />);
    expect(screen.getByText('DeckBracket.assessing')).toBeInTheDocument();
  });

  it('shows a complete assessment with its provenance and signal badges', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({
      status: 'complete',
      report: { level: 2, signals },
      retry: vi.fn(),
    });
    render(<BracketSection cards={[]} />);
    expect(screen.getByText('DeckBracket.title')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.provenance')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.signal.turns')).toBeInTheDocument();
    expect(screen.queryByText('DeckBracket.partialNotice')).toBeNull();
  });

  it('marks a degraded assessment as a floor, lists the failed sources and offers a retry', () => {
    const retry = vi.fn();
    vi.mocked(useBracketAssessment).mockReturnValue({
      status: 'degraded',
      report: { level: 2, signals },
      unavailable: [
        { source: 'combos', failure: { kind: 'http', status: 503 } },
        { source: 'oracleText', failure: { kind: 'timeout' }, missing: 3, total: 40 },
      ],
      retry,
    });
    render(<BracketSection cards={[]} />);

    expect(screen.getByText('DeckBracket.partialTitle')).toBeInTheDocument();
    expect(screen.getByText('2+')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.partialNotice')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.sourceUnavailable')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.sourcePartial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /DeckBracket\.retry/ }));
    expect(retry).toHaveBeenCalled();
  });

  it('explains a failed assessment', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({ status: 'error', message: 'boom', retry: vi.fn() });
    render(<BracketSection cards={[]} />);
    expect(screen.getByText('DeckBracket.failed')).toBeInTheDocument();
  });

  it('keeps keyboard focus in the section when Retry replaces the notice with progress', () => {
    const degraded = {
      status: 'degraded' as const,
      report: { level: 2 as const, signals },
      unavailable: [{ source: 'combos' as const, failure: { kind: 'timeout' as const } }],
      retry: vi.fn(),
    };
    vi.mocked(useBracketAssessment).mockReturnValue(degraded);
    const { container, rerender } = render(<BracketSection cards={[]} />);
    const retryButton = screen.getByRole('button', { name: /DeckBracket\.retry/ });
    retryButton.focus();

    fireEvent.click(retryButton);
    vi.mocked(useBracketAssessment).mockReturnValue({ status: 'loading', retry: vi.fn() });
    rerender(<BracketSection cards={[]} />);

    expect(document.activeElement).toBe(container.firstChild);
  });
});
