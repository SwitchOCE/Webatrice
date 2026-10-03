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
 * Desktop gates the count behind its "show total selection count" setting;
 * the web client always shows it.
 */
export default function TallyOverlay() {
  const { rows, count } = useSelectionTally();
  if (rows.length === 0 && count <= 1) {
    return null;
  }
  return (
    <div className="absolute bottom-2.5 right-2.5 z-10 flex flex-col items-end gap-1 pointer-events-none">
      {rows.length > 0 && (
        <div role="status" aria-label="Tally" className={PANEL_CLASS}>
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
        <div role="status" aria-label={`${count} cards selected`} className={`${PANEL_CLASS} tabular-nums`}>
          {count}
        </div>
      )}
    </div>
  );
}
