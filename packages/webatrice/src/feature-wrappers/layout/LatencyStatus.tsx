import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Popover from '@mui/material/Popover';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';

import LatencyGraph from './LatencyGraph';

/**
 * Port of desktop LatencyStatusWidget (Cockatrice #7153): "Ping: N ms" beside a
 * sparkline of the rolling round-trip window, with the aggregate stats as the
 * tooltip. Clicking opens a larger graph with the same stats. Hidden until the
 * first sample and again after a disconnect zeroes the window.
 */
export default function LatencyStatus() {
  const { t } = useTranslation();
  const { stats, samplesMs } = useAppSelector(server.Selectors.getLatency);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (stats.sampleCount === 0) {
    return null;
  }

  const details = [
    t('LatencyStatus.summary', { count: stats.sampleCount }),
    t('LatencyStatus.last', { ms: stats.lastMs }),
    t('LatencyStatus.median', { ms: stats.medianMs }),
    t('LatencyStatus.p95', { ms: stats.p95Ms }),
    t('LatencyStatus.max', { ms: stats.maxMs }),
  ].join('\n');

  return (
    <>
      <button
        type="button"
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-elevated"
        title={details}
        aria-label={t('LatencyStatus.accessibleName')}
      >
        <LatencyGraph samplesMs={samplesMs} width={90} height={14} />
        <span>{t('LatencyStatus.ping', { ms: stats.lastMs })}</span>
      </button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <div className="flex flex-col gap-2 p-2" role="group" aria-label={t('LatencyStatus.detailsName')}>
          <div className="whitespace-pre-line text-sm select-text">{details}</div>
          <LatencyGraph samplesMs={samplesMs} width={280} height={80} />
        </div>
      </Popover>
    </>
  );
}
