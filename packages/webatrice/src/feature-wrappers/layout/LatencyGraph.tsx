// Port of desktop LatencyGraphWidget (Cockatrice #7153): one bar per sample,
// oldest on the left. Bar heights are relative to the window's worst sample,
// floored at MIN_SCALE_MS so small jitter stays readable; bar colour follows an
// absolute ramp, green at 0 ms to red at COLOR_SCALE_MS, so a steady good ping
// never looks alarming.
const COLOR_SCALE_MS = 500;
const MIN_SCALE_MS = 100;

export function latencyBarColor(ms: number): string {
  const ratio = Math.min(1, Math.max(0, ms / COLOR_SCALE_MS));
  return `hsl(${Math.round(120 * (1 - ratio))}, 100%, 50%)`;
}

interface LatencyGraphProps {
  samplesMs: readonly number[];
  width: number;
  height: number;
}

export default function LatencyGraph({ samplesMs, width, height }: LatencyGraphProps) {
  if (samplesMs.length === 0) {
    return null;
  }
  const scaleMs = Math.max(MIN_SCALE_MS, ...samplesMs);
  const barWidth = width / samplesMs.length;
  return (
    <svg width={width} height={height} aria-hidden="true" data-testid="latency-graph">
      {samplesMs.map((ms, i) => {
        const barHeight = Math.min(1, Math.max(0, ms / scaleMs)) * height;
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - barHeight}
            width={Math.max(1, barWidth - 2)}
            height={barHeight}
            fill={latencyBarColor(ms)}
          />
        );
      })}
    </svg>
  );
}
