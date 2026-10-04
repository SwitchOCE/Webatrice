import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { sortIndicesByName } from '../../deckGrouping';
import type { DeckCard } from '../../types';

/** Bare "type a card name and press Enter to add" input shown in the
 *  non-MTG toolbar. No autocomplete, no lookup — the whole point of a
 *  non-MTG deck is that we don't know what the cards are. */
export function PlainAddCard({ onAdd }: { onAdd: (name: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onAdd(trimmed);
    setValue('');
  };
  return (
    <div className="relative w-72">
      <Plus
        size={12}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder={t('DeckEditor.list.addPlaceholder')}
        className={[
          'w-full pl-7 pr-3 py-1.5 rounded-md bg-bg-base border',
          'border-border-subtle text-xs text-text-primary',
          'placeholder:text-text-muted focus:outline-none',
          'focus:ring-1 focus:border-accent focus:ring-accent transition-colors',
        ].join(' ')}
      />
    </div>
  );
}

/** Flat single-column card list for non-MTG decks. Same row shape as
 *  MTG cards but stripped of previews, printings, commander toggle,
 *  and price. Uses the same alphabetical sort so the list reads the
 *  way the deck editor already does for MTG decks. */
export function PlainCardList({
  cards,
  onInc,
  onDelete,
}: {
  cards: DeckCard[];
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
}) {
  const sortedIndices = useMemo(() => sortIndicesByName(cards, cards.map((_, i) => i)), [cards]);

  return (
    <ul>
      {sortedIndices.map((i) => (
        <li key={i}>
          <PlainCardRow
            card={cards[i]}
            onInc={(delta) => onInc(i, delta)}
            onDelete={() => onDelete(i)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Row used inside `FlatCardList`. Deliberately simpler than
 *  `CardRow` — no hover preview, no chevron menu, no printings /
 *  commander / sideboard toggles. Just quantity +/-, name, and a
 *  delete button. */
function PlainCardRow({
  card,
  onInc,
  onDelete,
}: {
  card: DeckCard;
  onInc: (delta: number) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-elevated transition-colors">
      <span className="text-xs tabular-nums text-text-muted w-6 text-right shrink-0">
        {card.quantity}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm text-text-primary">
        {card.name}
      </span>
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onInc(-1)}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-base transition-colors"
          title={t('DeckEditor.list.decrease')}
          aria-label={t('DeckEditor.list.decreaseCard', { card: card.name })}
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          onClick={() => onInc(1)}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-base transition-colors"
          title={t('DeckEditor.list.increase')}
          aria-label={t('DeckEditor.list.increaseCard', { card: card.name })}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-text-muted hover:text-danger hover:bg-red-500/10 transition-colors"
          title={t('Common.action.remove')}
          aria-label={t('DeckEditor.list.removeCard', { card: card.name })}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
