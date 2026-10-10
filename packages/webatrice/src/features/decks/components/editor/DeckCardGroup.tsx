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
  selectedIndex: number;
  onSelect: (card: DeckCard) => void;
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onSetCategory: (index: number, category: DeckCategory) => void;
  onSetCommander: (index: number, isCommander: boolean) => void;
  onChangePrinting: (index: number, card: DeckCard) => void;
  onShowDetails?: (card: DeckCard) => void;
  isMtg: boolean;
  isCommander: boolean;
  legality?: readonly CardLegality[];
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
  selectedIndex,
  onSelect,
  onInc,
  onDelete,
  onSetCategory,
  onSetCommander,
  onChangePrinting,
  onShowDetails,
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
    <section className="mb-4 min-w-0 break-inside-avoid">
      <h3
        id={headingId}
        className="flex items-center gap-2 border-b border-border-subtle pb-1.5 font-display text-[13px] font-semibold text-text-primary"
      >
        <Icon size={14} className="shrink-0 text-text-muted" />
        {t(`DeckEditor.section.${label.toLowerCase()}`, { count: totalQty })}
        <span className="font-sans font-normal tabular-nums text-text-muted">{totalQty}</span>
      </h3>
      <div role="grid" aria-labelledby={headingId} className="mt-1 flex flex-col">
        {indices.map((i) => (
          <DeckCardRow
            key={deckRowKey(deck[i])}
            card={deck[i]}
            selected={i === selectedIndex}
            onSelect={() => onSelect(deck[i])}
            rowProps={grid?.getDeckRowProps(i)}
            onInc={(delta) => (delta < 0 && grid ? grid.decrementRow(i) : onInc(i, delta))}
            onDelete={() => (grid ? grid.removeRow(i) : onDelete(i))}
            onSetCategory={(c) => (grid ? grid.moveRow(i, c) : onSetCategory(i, c))}
            onSetCommander={(v) => onSetCommander(i, v)}
            onChangePrinting={() => onChangePrinting(i, deck[i])}
            onShowDetails={onShowDetails ? () => onShowDetails(deck[i]) : undefined}
            isMtg={isMtg}
            isCommander={isCommander}
            legality={legality?.[i]}
          />
        ))}
      </div>
    </section>
  );
}
