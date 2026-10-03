import { useState } from 'react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';

import type { BracketAssessment, DeckCategory } from '@app/types';

import { EMPTY_FILTERS, type SearchFiltersState } from '../../cardSearchQuery';
import { DeckBreakdown } from '../breakdown/DeckBreakdown';
import type { DeckCardGroup as DeckCardGroupData } from '../../deckGrouping';
import type { CardLegality } from '../../deckLegality';
import type { DeckCard, HydratedDeck } from '../../types';
import { AdvancedCardSearch } from '../search/AdvancedCardSearch';
import { DeckCardGroup } from './DeckCardGroup';
import { EmptyCardsHint } from './DeckEditorShells';
import { ACCENT_BUTTON_CLASS } from './editorStyles';
import { PlainAddCard, PlainCardList } from './PlainCardList';
import { QuickAddSearch } from './QuickAddSearch';
import { SampleHandPanel } from './SampleHandPanel';

export interface DeckMainPaneProps {
  deck: HydratedDeck;
  groups: DeckCardGroupData[];
  onAddByName: (name: string) => void;
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onSetCategory: (index: number, category: DeckCategory) => void;
  onSetCommander: (index: number, isCommander: boolean) => void;
  onPreviewCard: (card: DeckCard | null) => void;
  onChangePrinting: (index: number, card: DeckCard) => void;
  /** Optional — undefined for non-MTG decks (they don't get a detail
   *  modal since there's nothing MTG-specific to render). When set,
   *  clicking a card row's name opens the modal. */
  onCardClick?: (card: DeckCard) => void;
  /** Previously-persisted bracket assessment (from the .cod). Passed
   *  through to DeckBreakdown so BracketSection can skip the Scryfall
   *  + Spellbook fetches when the fingerprint still matches. */
  cachedBracketAssessment: BracketAssessment | undefined;
  /** Forwarded straight to DeckBreakdown → BracketSection: fires
   *  after the bracket assessment resolves so we can cache the full
   *  result (level + flagged cards + fingerprint) into the .cod's
   *  `<bracketAssessment>` element. */
  onBracketAssessmentComputed: (assessment: BracketAssessment | undefined) => void;
  isMtg: boolean;
  isCommander: boolean;
  /** Legality by card index, for the red illegal-row styling. */
  legality?: readonly CardLegality[];
}

export function DeckMainPane({
  deck,
  groups,
  onAddByName,
  onInc,
  onDelete,
  onSetCategory,
  onSetCommander,
  onPreviewCard,
  onChangePrinting,
  onCardClick,
  cachedBracketAssessment,
  onBracketAssessmentComputed,
  isMtg,
  isCommander,
  legality,
}: DeckMainPaneProps) {
  // Right-pane view mode. `deckList` is the default (grouped column
  // layout of deck rows). `search` is the full-page advanced search
  // view — takes over the whole pane, hides QuickAdd.
  const [rightView, setRightView] = useState<'deckList' | 'search'>('deckList');
  // Quick-add query lifted out of QuickAddSearch so we can hand it
  // off to advanced search when the user clicks that button — matches
  // the "if they were mid-typing, don't lose it" UX ask.
  const [quickAddQuery, setQuickAddQuery] = useState('');
  // Advanced-search state: typed text + filter state, preserved across
  // view toggles so the user can bounce Back → Advanced search without
  // re-typing everything.
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [filters, setFilters] = useState<SearchFiltersState>(EMPTY_FILTERS);

  const openAdvancedSearch = () => {
    // If the user had typed into QuickAdd, transfer that text over
    // and clear QuickAdd — matches the "don't lose their work" ask.
    if (quickAddQuery.trim()) {
      setAdvancedQuery(quickAddQuery);
      setQuickAddQuery('');
    }
    setRightView('search');
  };

  // Only MTG decks get Scryfall search / advanced search. Non-MTG
  // decks force the deckList view (no search view exists for them).
  const activeView = isMtg ? rightView : 'deckList';

  return (
    <section className="min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-2 border-b border-border-subtle bg-bg-surface/50">
        {isMtg ? (
          activeView === 'deckList' ? (
            <>
              <button
                type="button"
                onClick={openAdvancedSearch}
                title="Advanced search"
                className={ACCENT_BUTTON_CLASS}
              >
                <SlidersHorizontal size={12} /> Advanced search
              </button>
              <QuickAddSearch
                query={quickAddQuery}
                onQueryChange={setQuickAddQuery}
                onAdd={onAddByName}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRightView('deckList')}
              title="Back to deck list"
              className={ACCENT_BUTTON_CLASS}
            >
              <ArrowLeft size={12} /> Back to deck
            </button>
          )
        ) : (
          // Non-MTG toolbar: plain typed-name entry, no Scryfall
          // autocomplete or advanced search since we have no card DB
          // to search against.
          <PlainAddCard onAdd={onAddByName} />
        )}
      </div>

      {activeView === 'deckList' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {deck.cards.length === 0 ? (
            <EmptyCardsHint isMtg={isMtg} />
          ) : isMtg ? (
            // MTG: CSS multi-column masonry with category groups, then
            // stats block underneath. `space-y-10` matches fancy's
            // spacing between the deck-list columns and DeckBreakdown.
            <div className="space-y-10">
              <div style={{ columns: '260px', columnGap: '1.5rem' }}>
                {groups.map(({ label, indices }) => (
                  <DeckCardGroup
                    key={label}
                    label={label}
                    indices={indices}
                    deck={deck.cards}
                    onInc={onInc}
                    onDelete={onDelete}
                    onSetCategory={onSetCategory}
                    onSetCommander={onSetCommander}
                    onPreview={onPreviewCard}
                    onChangePrinting={onChangePrinting}
                    onCardClick={onCardClick}
                    isMtg={isMtg}
                    isCommander={isCommander}
                    legality={legality}
                  />
                ))}
              </div>
              <SampleHandPanel cards={deck.cards} showImages />
              <DeckBreakdown
                cards={deck.cards}
                format={deck.format}
                cachedAssessment={cachedBracketAssessment}
                onAssessmentComputed={onBracketAssessmentComputed}
              />
            </div>
          ) : (
            // Non-MTG: flat alphabetical list, single column. No
            // grouping (no type_line to group by), no preview hover
            // (nothing to preview), no printings / commander toggles.
            <div className="max-w-md mx-auto space-y-6">
              <PlainCardList
                cards={deck.cards}
                onInc={onInc}
                onDelete={onDelete}
              />
              <SampleHandPanel cards={deck.cards} showImages={false} />
            </div>
          )}
        </div>
      ) : (
        <AdvancedCardSearch
          query={advancedQuery}
          onQueryChange={setAdvancedQuery}
          filters={filters}
          onFiltersChange={setFilters}
          onAddByName={onAddByName}
          onPreviewCard={onPreviewCard}
        />
      )}
    </section>
  );
}
