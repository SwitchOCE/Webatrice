import { useSelectionTally } from '../../hooks/useSelectionTally';

/**
 * The tally of the selected cards, overlaid at the bottom right of the board
 * (desktop GameView's tally container, game_view.cpp:206-320). Hidden while the
 * chosen tally has no rows.
 */
export default function TallyOverlay() {
  const { rows } = useSelectionTally();
  if (rows.length === 0) {
    return null;
  }
  return (
    <div
      role="status"
      aria-label="Tally"
      className={[
        'absolute bottom-2.5 right-2.5 z-10 pointer-events-none select-none rounded-md',
        'bg-bg-surface/85 border border-border-subtle px-2 py-1 text-xs text-text-primary shadow-glow',
      ].join(' ')}
    >
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
  );
}
