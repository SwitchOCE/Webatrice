import { act, fireEvent, render, screen } from '@testing-library/react';

import { SignalBadge } from './SignalBadge';

afterEach(() => {
  vi.useRealTimers();
});

describe('SignalBadge', () => {
  it('shows its count and lists the contributing cards on hover', () => {
    vi.useFakeTimers();
    render(<SignalBadge label="Game Changers" count={2} tone="warn" items={['Sol Ring', 'Rhystic Study']} />);

    const badge = screen.getByText('2').parentElement!;
    expect(badge).toHaveClass('cursor-help');
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('list')).toHaveTextContent('Sol RingRhystic Study');

    fireEvent.mouseLeave(badge);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('has no tooltip without contributing cards', () => {
    render(<SignalBadge label="MLD" count={0} tone="muted" items={[]} />);
    const badge = screen.getByText('0').parentElement!;
    fireEvent.mouseEnter(badge);
    expect(screen.queryByRole('list')).toBeNull();
    expect(badge).not.toHaveClass('cursor-help');
  });
});
