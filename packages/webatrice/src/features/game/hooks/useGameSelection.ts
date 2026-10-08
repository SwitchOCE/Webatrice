import { Dispatch, SetStateAction, useCallback, useState } from 'react';

import { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { makeCardKey } from '../utils/CardRegistry/CardRegistryContext';
import { EMPTY_SELECTION } from '../utils/selection';

export interface GameSelection {
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  collapseUnlessSelected: (
    ownerPlayerId: number | undefined,
    zone: string | undefined,
    card: ServerInfo_Card,
  ) => void;
  clearSelection: () => void;
}

/** The game's card selection, as card keys across every seat and zone. */
export function useGameSelection(): GameSelection {
  const [selectedCardKeys, setSelectedCardKeys] = useState<ReadonlySet<string>>(EMPTY_SELECTION);

  // Selects just this card, unless it is already part of the selection.
  const collapseUnlessSelected = useCallback(
    (ownerPlayerId: number | undefined, zone: string | undefined, card: ServerInfo_Card) => {
      if (ownerPlayerId == null || zone == null) {
        return;
      }
      const key = makeCardKey(ownerPlayerId, zone, card.id);
      setSelectedCardKeys((prev) => (prev.has(key) ? prev : new Set([key])));
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelectedCardKeys(EMPTY_SELECTION);
  }, []);

  return {
    selectedCardKeys,
    setSelectedCardKeys,
    collapseUnlessSelected,
    clearSelection,
  };
}
