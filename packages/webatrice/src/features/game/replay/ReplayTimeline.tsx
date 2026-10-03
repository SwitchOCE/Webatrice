import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { createTimelineHistogram } from '@app/services';

import { formatReplayTime } from './formatReplayTime';

export interface ReplayTimelineProps {
  timeline: readonly number[];
  currentTime: number;
  maxTime: number;
  onSeek: (time: number) => void;
}

/**
 * Port of desktop's ReplayTimelineWidget: an event-density silhouette (events
 * per 5 s bin) under a progress fill; clicking jumps to that point.
 */
function ReplayTimeline({ timeline, currentTime, maxTime, onSeek }: ReplayTimelineProps) {
  const { t } = useTranslation();

  const silhouette = useMemo(() => {
    const histogram = createTimelineHistogram(timeline);
    const peak = Math.max(1, ...histogram);
    const points = histogram.map((count, i) => `${i},${100 - (count / peak) * 100}`);
    return { width: histogram.length, path: `M0,100 L${points.join(' L')} L${histogram.length},100 Z` };
  }, [timeline]);

  const progress = maxTime > 0 ? Math.min(1, currentTime / maxTime) : 0;

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(Math.round(maxTime * fraction));
  };

  return (
    <div
      className="replay-timeline"
      role="slider"
      tabIndex={-1}
      aria-label={t('GameReplay.timeline.label')}
      aria-valuemin={0}
      aria-valuemax={maxTime}
      aria-valuenow={currentTime}
      aria-valuetext={`${formatReplayTime(currentTime)} / ${formatReplayTime(maxTime)}`}
      data-testid="replay-timeline"
      onClick={handleClick}
    >
      <svg
        className="replay-timeline__histogram"
        viewBox={`0 0 ${silhouette.width} 100`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={silhouette.path} />
      </svg>
      <div className="replay-timeline__progress" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

export default ReplayTimeline;
