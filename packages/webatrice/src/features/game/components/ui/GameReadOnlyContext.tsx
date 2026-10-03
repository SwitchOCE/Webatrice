import { createContext, useContext } from 'react';

// True while the board shows a replay (desktop TabGame in replay mode): the game
// is rebuilt from recorded events, so nothing on it may send a command or apply
// an optimistic update. Provided once by GameBoard; consumers outside the board
// grid (sidebar chrome, chat input) read it to drop their live-game affordances.
const GameReadOnlyContext = createContext(false);

export const GameReadOnlyProvider = GameReadOnlyContext.Provider;

export function useGameReadOnly(): boolean {
  return useContext(GameReadOnlyContext);
}
