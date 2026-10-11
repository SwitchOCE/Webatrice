export type TaskOutcome = 'ok' | 'flood' | 'failed' | 'stop';

export interface PacedQueueOptions {
  intervalMs: number;
  floodBackoffMs: number;
  maxFloodRetries: number;
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PacedQueueResult {
  completed: number;
  stopped: boolean;
}

export const SERVER_PACING = {
  intervalMs: 1200,
  floodBackoffMs: 10_000,
  maxFloodRetries: 3,
} as const;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runPaced<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<TaskOutcome>,
  onSettled: (item: T, index: number, outcome: Exclude<TaskOutcome, 'stop'>) => void,
  options: PacedQueueOptions,
): Promise<PacedQueueResult> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  let lastStart = -Infinity;
  for (let index = 0; index < items.length; index++) {
    let floods = 0;
    for (;;) {
      if (options.isCancelled?.()) {
        return { completed: index, stopped: true };
      }
      const wait = lastStart + options.intervalMs - now();
      if (wait > 0) {
        await sleep(wait);
      }
      lastStart = now();
      const outcome = await task(items[index], index);
      if (outcome === 'stop') {
        return { completed: index, stopped: true };
      }
      if (outcome === 'flood' && floods < options.maxFloodRetries) {
        floods += 1;
        await sleep(options.floodBackoffMs * floods);
        continue;
      }
      onSettled(items[index], index, outcome);
      break;
    }
  }
  return { completed: items.length, stopped: false };
}
