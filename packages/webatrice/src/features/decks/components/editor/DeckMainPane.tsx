import { useMemo } from 'react';

import type { DeckCategory } from '@app/types';

import { sortIndicesByName, type DeckCardGroup as DeckCardGroupData } from '../../deckGrouping';
import type { CardLegality } from '../../deckLegality';
import { useDeckCardGrid } from '../../hooks/useDeckCardGrid';
import type { DeckCard, HydratedDeck } from '../../types';
import { DeckCardGroup } from './DeckCardGroup';
import { EmptyCardsHint } from './DeckEditorShells';
import { PlainCardList } from './PlainCardList';

export interface DeckMainPaneProps {
  deck: HydratedDeck;
  groups: DeckCardGroupData[];
  selectedIndex: number;
  onSelect: (card: DeckCard) => void;
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onSetCategory: (index: number, category: DeckCategory) => void;
  onSetCommander: (index: number, isCommander: boolean) => void;
  onChangePrinting: (index: number, card: DeckCard) => void;
  onShowDetails?: (card: DeckCard) => void;
  onLastRowRemoved?: () => void;
  isMtg: boolean;
  isCommander: boolean;
  legality?: readonly CardLegality[];
}

export function DeckMainPane({
  deck,
  groups,
  selectedIndex,
  onSelect,
  onInc,
  onDelete,
  onSetCategory,
  onSetCommander,
  onChangePrinting,
  onShowDetails,
  onLastRowRemoved,
  isMtg,
  isCommander,
  legality,
}: DeckMainPaneProps) {
  const rowOrder = useMemo(
    () => (isMtg
      ? groups.flatMap(({ indices }) => indices)
      : sortIndicesByName(deck.cards, deck.cards.map((_, i) => i))),
    [isMtg, groups, deck.cards],
  );
  const grid = useDeckCardGrid({
    cards: deck.cards,
    order: rowOrder,
    onInc,
    onDelete,
    onSetCategory,
    onLastRowRemoved,
  });

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4">
      {deck.cards.length === 0 ? (
        <EmptyCardsHint isMtg={isMtg} />
      ) : isMtg ? (
        <div style={{ columns: '230px', columnGap: 24 }}>
          {groups.map(({ label, indices }) => (
            <DeckCardGroup
              key={label}
              label={label}
              indices={indices}
              deck={deck.cards}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
              onInc={onInc}
              onDelete={onDelete}
              onSetCategory={onSetCategory}
              onSetCommander={onSetCommander}
              onChangePrinting={onChangePrinting}
              onShowDetails={onShowDetails}
              isMtg={isMtg}
              isCommander={isCommander}
              legality={legality}
              grid={grid}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md">
          <PlainCardList
            cards={deck.cards}
            onInc={onInc}
            onDelete={onDelete}
            grid={grid}
            order={rowOrder}
          />
        </div>
      )}
    </div>
  );
}
