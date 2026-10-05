import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';

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

  // Escape clears the selection, unless a MUI dialog owns the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.MuiDialog-root[role="dialog"]')) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection]);

  return { selectedCardKeys, setSelectedCardKeys, clearSelection };
}
