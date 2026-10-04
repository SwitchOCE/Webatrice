import { createContext, useContext, useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';

/**
 * The game's one card selection (useGameSelection), shared with the leaves that
 * write it. Keys are `makeCardKey(owner, zone, cardId)`, so a selection can
 * only ever belong to one place at a time across every seat.
 */
export interface GameSelectionState {
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

/** The selection a seat reads outside a game: nothing selected. */
export const EMPTY_CARD_KEYS: ReadonlySet<string> = new Set();

const GameSelectionContext = createContext<GameSelectionState | null>(null);

export function GameSelectionProvider({
  selectedCardKeys,
  setSelectedCardKeys,
  children,
}: GameSelectionState & { children: ReactNode }) {
  const value = useMemo(
    () => ({ selectedCardKeys, setSelectedCardKeys }),
    [selectedCardKeys, setSelectedCardKeys],
  );
  return <GameSelectionContext.Provider value={value}>{children}</GameSelectionContext.Provider>;
}

/** The game selection, or null outside a game (isolated component renders). */
export function useGameSelectionState(): GameSelectionState | null {
  return useContext(GameSelectionContext);
}
