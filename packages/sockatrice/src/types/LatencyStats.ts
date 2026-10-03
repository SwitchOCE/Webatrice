/**
 * Aggregated command round-trip times over the rolling sample window, in
 * milliseconds. Mirrors desktop `LatencyTracker::Stats` (Cockatrice #7153).
 * Every field is 0 while the window is empty (before the first response, and
 * after a disconnect clears it).
 */
export interface LatencyStats {
  /** Most recent sample. */
  lastMs: number;
  /** Median over the window. */
  medianMs: number;
  /** 95th percentile over the window (nearest rank). */
  p95Ms: number;
  /** Maximum over the window. */
  maxMs: number;
  /** Number of samples currently in the window. */
  sampleCount: number;
}
