import { createContext, useContext } from 'react';

// @critical True while the board shows a replay (desktop TabGame in replay mode): the game
// is rebuilt from recorded events, so nothing on it may send a command or apply
// an optimistic update. Provided once by GameReplay; consumers outside the board
// grid (sidebar chrome, chat input) read it to drop their live-game affordances,
// and useGameAffordances turns every affordance off under it.
// See .github/instructions/webatrice.instructions.md#replay-playback.
const GameReadOnlyContext = createContext(false);

export const GameReadOnlyProvider = GameReadOnlyContext.Provider;

export function useGameReadOnly(): boolean {
  return useContext(GameReadOnlyContext);
}
