import { useTranslation } from 'react-i18next';
import { usePreference } from '@app/hooks';

import { useSelectionTally } from '../../hooks/useSelectionTally';

const PANEL_CLASS = [
  'pointer-events-none select-none rounded-md',
  'bg-bg-surface/85 border border-border-subtle px-2 py-1 text-xs text-text-primary shadow-glow',
].join(' ');

/**
 * The tally of the selected cards and the selection count, overlaid at the
 * bottom right of the board (desktop GameView's tally container and total
 * count label, game_view.cpp:206-320): the count shows from two selected
 * cards, the tally above it while it has rows.
 *
 * The count follows desktop's "Show total selection count" (on by default).
 * Only the tally is announced: the count changes with every click, so its
 * region stays silent.
 */
export default function TallyOverlay() {
  const { t } = useTranslation();
  const { rows, count: selected } = useSelectionTally();
  const showCount = usePreference('showTotalSelectionCount');
  const count = showCount ? selected : 0;
  if (rows.length === 0 && count <= 1) {
    return null;
  }
  return (
    <div className="absolute bottom-2.5 right-2.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
      {rows.length > 0 && (
        <div role="status" aria-label={t('TallyOverlay.tally')} className={PANEL_CLASS}>
          <table>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="pr-3">{row.name}</td>
                  <td className="text-right tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {count > 1 && (
        <div
          role="status"
          aria-live="off"
          aria-label={t('TallyOverlay.selectedCount', { count })}
          className={`${PANEL_CLASS} tabular-nums`}
        >
          {count}
        </div>
      )}
    </div>
  );
}
