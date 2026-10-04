import { useId } from 'react';
import {
  Archive,
  Crown,
  Flag,
  Mountain,
  MoreHorizontal,
  PawPrint,
  Sparkle,
  Sparkles,
  Trophy,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DeckCategory } from '@app/types';

import type { DeckSection } from '../../deckGrouping';
import type { CardLegality } from '../../deckLegality';
import type { DeckCard } from '../../types';
import { deckRowKey, type DeckCardGrid } from '../../hooks/useDeckCardGrid';
import { DeckCardRow } from './DeckCardRow';

export interface DeckCardGroupProps {
  label: string;
  indices: number[];
  deck: DeckCard[];
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onSetCategory: (index: number, category: DeckCategory) => void;
  onSetCommander: (index: number, isCommander: boolean) => void;
  onPreview: (card: DeckCard | null) => void;
  onChangePrinting: (index: number, card: DeckCard) => void;
  onCardClick?: (card: DeckCard) => void;
  isMtg: boolean;
  isCommander: boolean;
  /** Legality by card index into `deck`. */
  legality?: readonly CardLegality[];
  /** The deck list's keyboard grid, shared by every section so ↑/↓ cross between them. */
  grid?: DeckCardGrid;
}

const SECTION_ICON: Record<DeckSection, LucideIcon> = {
  Commander: Crown,
  Creature: PawPrint,
  Planeswalker: Sparkles,
  Battle: Flag,
  Instant: Zap,
  Sorcery: Wand2,
  Enchantment: Sparkle,
  Artifact: Trophy,
  Land: Mountain,
  Other: MoreHorizontal,
  Sideboard: Archive,
};

export function DeckCardGroup({
  label,
  indices,
  deck,
  onInc,
  onDelete,
  onSetCategory,
  onSetCommander,
  onPreview,
  onChangePrinting,
  onCardClick,
  isMtg,
  isCommander,
  legality,
  grid,
}: DeckCardGroupProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const totalQty = indices.reduce((sum, i) => sum + deck[i].quantity, 0);
  const Icon = SECTION_ICON[label] ?? MoreHorizontal;
  return (
    <section className="min-w-0 mb-6 break-inside-avoid">
      <h3 id={headingId} className="flex items-center gap-2 mb-2 pb-1.5 border-b border-border-subtle">
        <Icon size={14} className="text-text-secondary shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t(`DeckEditor.section.${label.toLowerCase()}`)}
        </span>
        <span className="text-sm tabular-nums text-text-muted">{totalQty}</span>
      </h3>
      {/* One grid per section, named by its heading; the rows of all sections share one tab stop. */}
      <div role="grid" aria-labelledby={headingId}>
        {indices.map((i) => (
          <DeckCardRow
            key={deckRowKey(deck[i])}
            card={deck[i]}
            rowProps={grid?.getDeckRowProps(i)}
            onInc={(delta) => (delta < 0 && grid ? grid.decrementRow(i) : onInc(i, delta))}
            onDelete={() => (grid ? grid.removeRow(i) : onDelete(i))}
            onSetCategory={(c) => (grid ? grid.moveRow(i, c) : onSetCategory(i, c))}
            onSetCommander={(v) => onSetCommander(i, v)}
            onHover={() => onPreview(deck[i])}
            onChangePrinting={() => onChangePrinting(i, deck[i])}
            onCardClick={onCardClick ? () => onCardClick(deck[i]) : undefined}
            isMtg={isMtg}
            isCommander={isCommander}
            legality={legality?.[i]}
          />
        ))}
      </div>
    </section>
  );
}
