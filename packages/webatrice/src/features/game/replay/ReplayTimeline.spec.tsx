import { fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from '../../../__test-utils__';
import ReplayTimeline from './ReplayTimeline';

it('renders a bounded silhouette for a long replay and still seeks across its full duration', () => {
  const maxTime = 1_000_000_000;
  const onSeek = vi.fn();
  renderWithProviders(<ReplayTimeline timeline={[0, maxTime]} currentTime={0} maxTime={maxTime} onSeek={onSeek} />);

  const timeline = screen.getByRole('slider');
  const svg = timeline.querySelector('svg')!;
  expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeLessThanOrEqual(2048);
  expect(svg.querySelector('path')!.getAttribute('d')!.split(' L').length).toBeLessThanOrEqual(2050);
  fireEvent.keyDown(timeline, { key: 'End' });
  expect(onSeek).toHaveBeenCalledWith(maxTime);
});
