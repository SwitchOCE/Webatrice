import { fireEvent, render, screen } from '@testing-library/react';

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

describe('BracketSection', () => {
  it('shows progress while assessing', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({ status: 'loading', retry: vi.fn() });
    render(<BracketSection cards={[]} />);
    expect(screen.getByText('Assessing bracket…')).toBeInTheDocument();
  });

  it('shows a complete assessment with its provenance and signal badges', () => {
    vi.mocked(useBracketAssessment).mockReturnValue({
      status: 'complete',
      report: { level: 2, signals },
      retry: vi.fn(),
    });
    render(<BracketSection cards={[]} />);
    expect(screen.getByText('Bracket 2 · Core')).toBeInTheDocument();
    expect(screen.getByText('DeckBracket.provenance')).toBeInTheDocument();
    expect(screen.getByText('Extra turns')).toBeInTheDocument();
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
    expect(screen.getByText('Couldn\'t assess bracket: boom')).toBeInTheDocument();
  });
});
