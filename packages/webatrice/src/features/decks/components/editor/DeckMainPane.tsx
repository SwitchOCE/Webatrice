import { useMemo } from 'react';

import type { DeckCategory } from '@app/types';

import { DECK_COLUMN_GAP, deckColumnLayout } from '../../deckColumns';
import type { DeckRowDensity } from '../../deckEditorLayout';
import { sortIndicesByName, type DeckCardGroup as DeckCardGroupData } from '../../deckGrouping';
import type { CardLegality } from '../../deckLegality';
import { useDeckCardGrid } from '../../hooks/useDeckCardGrid';
import { useElementWidth } from '../../hooks/useElementWidth';
import type { DeckCard, HydratedDeck } from '../../types';
import { DeckCardGroup } from './DeckCardGroup';
import { EmptyCardsHint } from './DeckEditorShells';
import { PlainCardList } from './PlainCardList';

export interface DeckMainPaneProps {
  deck: HydratedDeck;
  groups: DeckCardGroupData[];
  selectedIndex: number;
  onSelect: (card: DeckCard) => void;
  onPreview?: (card: DeckCard | null) => void;
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
  density?: DeckRowDensity;
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (label: string) => void;
}

const NO_GROUPS: ReadonlySet<string> = new Set();

export function DeckMainPane({
  deck,
  groups,
  selectedIndex,
  onSelect,
  onPreview,
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
  density = 'comfortable',
  collapsedGroups = NO_GROUPS,
  onToggleGroup,
}: DeckMainPaneProps) {
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const rowOrder = useMemo(
    () => (isMtg
      ? groups.flatMap(({ label, indices }) => (collapsedGroups.has(label) ? [] : indices))
      : sortIndicesByName(deck.cards, deck.cards.map((_, i) => i))),
    [isMtg, groups, deck.cards, collapsedGroups],
  );
  const columns = useMemo(
    () => deckColumnLayout(width, density, groups.map(({ label, indices }) => ({
      rows: indices.length,
      collapsed: collapsedGroups.has(label),
    }))),
    [width, density, groups, collapsedGroups],
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
      <div ref={measureRef} aria-hidden className="h-0" />
      {deck.cards.length === 0 ? (
        <EmptyCardsHint isMtg={isMtg} />
      ) : isMtg ? (
        <div style={{ columnCount: columns.count, columnGap: DECK_COLUMN_GAP, maxWidth: columns.maxWidth }}>
          {groups.map(({ label, indices }, position) => (
            <DeckCardGroup
              key={label}
              label={label}
              indices={indices}
              deck={deck.cards}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
              onPreview={onPreview}
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
              density={density}
              columnBreak={columns.breaks.has(position)}
              collapsed={collapsedGroups.has(label)}
              onToggleCollapsed={onToggleGroup && (() => onToggleGroup(label))}
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
