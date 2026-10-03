import { sortedTypeCounts } from '../../deckStats';
import type { CardTypeGroup } from '../../types';

export function TypeBreakdown({
  counts,
}: {
  counts: Partial<Record<CardTypeGroup, number>>;
}) {
  const entries = sortedTypeCounts(counts);

  if (entries.length === 0) {
    return <div className="text-sm text-text-muted italic">No cards yet.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([type, count]) => (
        <div
          key={type}
          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-bg-elevated border border-border-subtle text-sm"
        >
          <span className="text-text-primary">{type}</span>
          <span className="text-text-muted tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}
