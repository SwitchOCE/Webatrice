import { createContext, useContext, useEffect, useRef } from 'react';

const NEVER_REWOUND = () => 0;

// The replay engine's rewind count (ReplayEngine.getRewindCount), read during render. A live game
// never rewinds.
const ReplayRewindContext = createContext<() => number>(NEVER_REWOUND);

export const ReplayRewindProvider = ReplayRewindContext.Provider;

/**
 * Whether this render is the first since the replay rewound the game. Desktop replays a backward
 * skip with SKIP_TAP_ANIMATION and SKIP_DAMAGE_ANIMATION, so the board's tap animation, life flash
 * and damage wash skip the changes the rewind made.
 */
export function useJustRewound(): boolean {
  const rewinds = useContext(ReplayRewindContext)();
  const seen = useRef(rewinds);
  useEffect(() => {
    seen.current = rewinds;
  });
  return rewinds !== seen.current;
}
