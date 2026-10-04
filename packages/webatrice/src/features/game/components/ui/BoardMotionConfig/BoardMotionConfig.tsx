import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

import { useBoardAnimations } from '@app/hooks';

/**
 * Points framer-motion (the hand slide) at the board animation policy rather than at its own
 * reading of the system setting: "Enable all" plays it under reduced motion, and "Disable all"
 * stops it.
 */
export function BoardMotionConfig({ children }: { children: ReactNode }) {
  const boardAnimations = useBoardAnimations();
  return <MotionConfig reducedMotion={boardAnimations ? 'never' : 'always'}>{children}</MotionConfig>;
}
