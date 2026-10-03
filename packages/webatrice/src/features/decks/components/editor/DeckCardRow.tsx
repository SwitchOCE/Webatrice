import { CircleAlert } from 'lucide-react';

import type { DeckCategory } from '@app/types';

import type { DeckCard } from '../../types';
import { ManaSymbols } from '../ManaSymbols';
import { DeckRowActionsMenu } from './DeckRowActionsMenu';

export interface DeckCardRowProps {
  card: DeckCard;
  onInc: (delta: number) => void;
  onDelete: () => void;
  onSetCategory: (category: DeckCategory) => void;
  onSetCommander: (isCommander: boolean) => void;
  onChangePrinting: () => void;
  onHover: () => void;
  /** Optional — when set, the card name renders as a button that
   *  opens the detail modal. Undefined for non-MTG decks. */
  onCardClick?: () => void;
  isMtg: boolean;
  isCommander: boolean;
}

export function DeckCardRow({
  card,
  onInc,
  onDelete,
  onSetCategory,
  onSetCommander,
  onHover,
  onChangePrinting,
  onCardClick,
  isMtg,
  isCommander,
}: DeckCardRowProps) {
  return (
    <div
      className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-bg-elevated transition-colors"
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <span className="text-xs tabular-nums text-text-muted w-5 text-right shrink-0">
        {card.quantity}
      </span>
      {onCardClick ? (
        <button
          type="button"
          onClick={onCardClick}
          className="flex-1 min-w-0 truncate text-sm text-text-primary text-left hover:text-accent transition-colors cursor-pointer"
          title="Click for details"
        >
          {card.name}
        </button>
      ) : (
        <span className="flex-1 min-w-0 truncate text-sm text-text-primary">
          {card.name}
        </span>
      )}
      {card.lookupSource === 'unknown' && (
        <span
          className="shrink-0 text-yellow-400"
          title="Not in your card DB and Scryfall couldn't find it. The card is saved but details/images can't be shown."
        >
          <CircleAlert size={10} />
        </span>
      )}
      <ManaSymbols cost={card.manaCost ?? ''} size={11} className="shrink-0 opacity-90" />
      <div className="shrink-0">
        <DeckRowActionsMenu
          card={card}
          onInc={() => onInc(1)}
          onDec={() => onInc(-1)}
          onDelete={onDelete}
          onSetCategory={onSetCategory}
          onSetCommander={onSetCommander}
          onChangePrinting={onChangePrinting}
          isMtg={isMtg}
          isCommander={isCommander}
        />
      </div>
    </div>
  );
}
