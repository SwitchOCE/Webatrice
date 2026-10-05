import { Dispatch, SetStateAction, useCallback, useState } from 'react';

import { EMPTY_SELECTION } from '../utils/selection';

export interface GameSelection {
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  clearSelection: () => void;
}

/** The game's card selection, as card keys across every seat and zone. */
export function useGameSelection(): GameSelection {
  const [selectedCardKeys, setSelectedCardKeys] = useState<ReadonlySet<string>>(EMPTY_SELECTION);

  const clearSelection = useCallback(() => {
    setSelectedCardKeys(EMPTY_SELECTION);
  }, []);

  return { selectedCardKeys, setSelectedCardKeys, clearSelection };
}
