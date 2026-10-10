import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, ChevronDown, CircleAlert } from 'lucide-react';

import { isContextMenuKey, type MenuAnchor } from '@app/components';
import type { DeckCategory } from '@app/types';

import type { CardLegality } from '../../deckLegality';
import type { DeckCardRowProps as GridRowProps } from '../../hooks/useDeckCardGrid';
import type { DeckCard } from '../../types';
import { ManaSymbols } from '@app/components';
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
  legality?: CardLegality;
  rowProps?: GridRowProps;
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
  legality,
  rowProps,
}: DeckCardRowProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const [quantityAtOpen, setQuantityAtOpen] = useState(card.quantity);
  const illegal = legality?.status === 'illegal' ? legality : undefined;
  const illegalText = illegal && t(`DeckLegality.reason.${illegal.reason}`, { max: illegal.max });
  const unknownText = card.lookupSource === 'unknown' ? t('DeckEditor.row.unknown') : '';
  const description = [unknownText, illegalText].filter(Boolean).join(' ');

  const openMenu = (trigger: HTMLElement, anchor: MenuAnchor) => {
    menuTriggerRef.current = trigger;
    setQuantityAtOpen(card.quantity);
    setMenuAnchor(anchor);
  };
  const openBelow = (trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    openMenu(trigger, { rect, placement: 'below', align: 'end' });
  };

  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.target as Node)) {
      return;
    }
    event.preventDefault();
    if (event.clientX === 0 && event.clientY === 0) {
      openBelow(event.currentTarget);
    } else {
      openMenu(event.currentTarget, { x: event.clientX, y: event.clientY });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && isContextMenuKey(event)) {
      event.preventDefault();
      openBelow(event.currentTarget);
      return;
    }
    rowProps?.onKeyDown(event);
  };

  return (
    <div
      {...rowProps}
      role="row"
      aria-label={t('DeckEditor.row.label', { count: card.quantity, card: card.name })}
      aria-description={description || undefined}
      className={[
        'group flex items-center gap-1.5 px-1 py-0.5 rounded transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        illegal ? 'bg-red-500/15 hover:bg-red-500/25' : 'hover:bg-bg-elevated',
      ].join(' ')}
      onMouseEnter={onHover}
      onFocus={onHover}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      title={illegalText}
    >
      <span role="gridcell" className="text-xs tabular-nums text-text-muted w-5 text-right shrink-0">
        {card.quantity}
      </span>
      <span role="gridcell" className="flex-1 min-w-0 flex">
        {onCardClick ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={onCardClick}
            className="flex-1 min-w-0 truncate text-sm text-text-primary text-left hover:text-accent transition-colors cursor-pointer"
            title={t('DeckEditor.row.details')}
          >
            {card.name}
          </button>
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm text-text-primary">
            {card.name}
          </span>
        )}
      </span>
      <span role="gridcell" className="shrink-0 flex items-center gap-1.5">
        {card.lookupSource === 'unknown' && (
          <span
            className="shrink-0 text-warning"
            title={unknownText}
            role="img"
            aria-label={unknownText}
          >
            <CircleAlert size={10} />
          </span>
        )}
        {illegalText && (
          <span className="shrink-0 text-danger" role="img" aria-label={illegalText}>
            <Ban size={10} />
          </span>
        )}
        <ManaSymbols cost={card.manaCost ?? ''} size={11} className="shrink-0 opacity-90" />
      </span>
      <span role="gridcell" className="shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (menuAnchor) {
              setMenuAnchor(null);
            } else {
              openBelow(e.currentTarget);
            }
          }}
          className="p-1 rounded hover:bg-bg-base text-text-muted hover:text-text-primary transition-colors"
          aria-label={t('DeckEditor.rowActions.trigger', { card: card.name })}
          title={t('DeckEditor.rowActions.trigger', { card: card.name })}
          aria-haspopup="menu"
          aria-expanded={menuAnchor != null}
        >
          <ChevronDown size={14} />
        </button>
        {menuAnchor && (
          <span role="status" className="sr-only">
            {card.quantity !== quantityAtOpen ? t('DeckEditor.rowActions.quantityNow', { count: card.quantity }) : ''}
          </span>
        )}
      </span>
      {menuAnchor && (
        <DeckRowActionsMenu
          card={card}
          anchor={menuAnchor}
          triggerRef={menuTriggerRef}
          onClose={() => setMenuAnchor(null)}
          onInc={() => onInc(1)}
          onDec={() => onInc(-1)}
          onDelete={onDelete}
          onSetCategory={onSetCategory}
          onSetCommander={onSetCommander}
          onChangePrinting={onChangePrinting}
          onShowDetails={onCardClick}
          isMtg={isMtg}
          isCommander={isCommander}
        />
      )}
    </div>
  );
}
