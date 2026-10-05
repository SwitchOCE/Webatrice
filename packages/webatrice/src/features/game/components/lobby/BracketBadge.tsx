import { bracketToneClass } from '@app/utils';

export default function BracketBadge({ level }: { level: number }) {
  // The deck editor's traffic-light palette, so a B3 chip in the lobby
  // matches the B3 verdict in the editor.
  const tone = bracketToneClass(level);
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold tabular-nums shrink-0 ${tone}`}
      title={`Commander Bracket ${level} (from the deck's cached assessment)`}
    >
      B{level}
    </span>
  );
}
