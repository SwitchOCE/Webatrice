import { fireEvent, screen } from '@testing-library/react';

import { connectedState, renderWithProviders } from '../../__test-utils__';

import { latencyBarColor } from './LatencyGraph';
import LatencyStatus from './LatencyStatus';

function stateWithLatency(sampleCount: number, samplesMs: number[]) {
  return {
    ...connectedState,
    server: {
      ...(connectedState.server as any),
      latency: { stats: { lastMs: 40, medianMs: 30, p95Ms: 90, maxMs: 90, sampleCount }, samplesMs },
    },
  };
}

describe('LatencyStatus', () => {
  it('stays hidden before the first sample', () => {
    renderWithProviders(<LatencyStatus />, { preloadedState: connectedState });
    expect(screen.queryByRole('button', { name: 'LatencyStatus.ping' })).not.toBeInTheDocument();
  });

  it('shows the last ping with a bar per sample and the stats as its tooltip', () => {
    renderWithProviders(<LatencyStatus />, { preloadedState: stateWithLatency(3, [30, 90, 40]) });

    const button = screen.getByRole('button', { name: 'LatencyStatus.ping' });
    expect(button).toHaveAccessibleDescription(/LatencyStatus\.median/);
    expect(button.getAttribute('title')?.split('\n')).toEqual([
      'LatencyStatus.summary',
      'LatencyStatus.last',
      'LatencyStatus.median',
      'LatencyStatus.p95',
      'LatencyStatus.max',
    ]);
    expect(screen.getByTestId('latency-graph').querySelectorAll('rect')).toHaveLength(3);
  });

  it('opens the larger graph with the stats on click', () => {
    renderWithProviders(<LatencyStatus />, { preloadedState: stateWithLatency(2, [30, 90]) });

    fireEvent.click(screen.getByRole('button', { name: 'LatencyStatus.ping' }));

    const details = screen.getByRole('group', { name: 'LatencyStatus.detailsName' });
    expect(details).toHaveTextContent('LatencyStatus.median');
    expect(screen.getAllByTestId('latency-graph')).toHaveLength(2);
  });
});

describe('latencyBarColor', () => {
  it('ramps from green at 0 ms to red at 500 ms and beyond', () => {
    expect(latencyBarColor(0)).toBe('hsl(120, 100%, 50%)');
    expect(latencyBarColor(250)).toBe('hsl(60, 100%, 50%)');
    expect(latencyBarColor(500)).toBe('hsl(0, 100%, 50%)');
    expect(latencyBarColor(5000)).toBe('hsl(0, 100%, 50%)');
  });
});
