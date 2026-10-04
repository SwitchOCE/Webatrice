import { useTranslation } from 'react-i18next';

import { deckSectionLabel, type DeckListSection, type DeckSummary } from '../../deckSummary';
import type { FlatDeck } from '../../deckTree';
import { DECK_LIST_ROW_ATTRIBUTE } from '../../hooks/useDeckDeleteFocus';
import type { DeckListViewMode } from '../../hooks/useDeckListViewMode';
import { DeckRow } from './DeckRow';

export interface DeckListSectionsProps {
  sections: DeckListSection[];
  summaries: ReadonlyMap<number, DeckSummary>;
  mode: DeckListViewMode;
  onOpen: (deck: FlatDeck) => void;
  onDelete: (deck: FlatDeck) => void;
  onMove?: (deck: FlatDeck) => void;
  onDownload?: (deck: FlatDeck) => void;
  onShare?: (deck: FlatDeck) => void;
  onTogglePublic?: (deck: FlatDeck) => void;
}

/** The deck rows, one titled section per format. */
export function DeckListSections({
  sections,
  summaries,
  mode,
  onOpen,
  onDelete,
  onMove,
  onDownload,
  onShare,
  onTogglePublic,
}: DeckListSectionsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {sections.map(({ section, decks }) => (
        <section key={section} className="space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
            <span>{deckSectionLabel(section, t)}</span>
            <span className="text-text-muted/70 tabular-nums">{decks.length}</span>
          </h2>
          <ul className="space-y-2">
            {decks.map((deck) => (
              <li key={deck.id} {...{ [DECK_LIST_ROW_ATTRIBUTE]: deck.id }}>
                <DeckRow
                  deck={deck}
                  summary={summaries.get(deck.id)}
                  mode={mode}
                  onOpen={() => onOpen(deck)}
                  onDelete={() => onDelete(deck)}
                  onMove={onMove && (() => onMove(deck))}
                  onDownload={onDownload && (() => onDownload(deck))}
                  onShare={onShare && (() => onShare(deck))}
                  onTogglePublic={onTogglePublic && (() => onTogglePublic(deck))}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
