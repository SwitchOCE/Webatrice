import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ChevronDown, Crown, Layers, Minus, PackageOpen, Plus, Trash2 } from 'lucide-react';

import type { DeckCategory } from '@app/types';

import type { DeckCard } from '../../types';

/** Kebab-menu of per-row actions — collapses what used to be a
 *  hover-reveal icon strip into a single ChevronDown trigger + a
 *  portal-rendered dropdown, matching fancy webatrice's DeckRowActionsMenu.
 *  Portal so the menu can escape the multi-column `break-inside-avoid`
 *  container without getting clipped. */
export function DeckRowActionsMenu({
  card,
  onInc,
  onDec,
  onDelete,
  onSetCategory,
  onSetCommander,
  onChangePrinting,
  isMtg,
  isCommander,
}: {
  card: DeckCard;
  onInc: () => void;
  onDec: () => void;
  onDelete: () => void;
  onSetCategory: (category: DeckCategory) => void;
  onSetCommander: (isCommander: boolean) => void;
  onChangePrinting: () => void;
  /** Deck-level format flag. Non-MTG decks drop the printings-picker
   *  menu item since Scryfall has nothing to show. */
  isMtg: boolean;
  /** Deck-level format flag. Non-commander decks drop the
   *  "Mark as commander" toggle. */
  isCommander: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 220;
    const MENU_ESTIMATED_HEIGHT = 220;
    const EDGE = 8;

    let left = rect.right - MENU_WIDTH;
    if (left < EDGE) {
      left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - EDGE);
    }

    let top = rect.bottom + 4;
    if (top + MENU_ESTIMATED_HEIGHT > window.innerHeight) {
      top = Math.max(EDGE, rect.top - MENU_ESTIMATED_HEIGHT - 4);
    }
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Renamed from `isCommander` to avoid shadowing the deck-level
  // `isCommander` prop (deck format = Commander) with a card-level
  // check (this row is flagged as the commander).
  const cardIsCommander = !!card.isCommander;
  const isSideboard = card.category === 'sideboard';

  const runAndClose = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded hover:bg-bg-base text-text-muted hover:text-text-primary transition-colors"
        title="Card actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ChevronDown size={14} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 w-[220px] rounded-lg bg-bg-surface border border-border-subtle shadow-glow py-1"
            style={{ left: pos.left, top: pos.top }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 flex items-center justify-between text-xs">
              <span className="text-text-secondary">Quantity</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onDec}
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary"
                  title="Remove one"
                  aria-label="Decrease quantity"
                >
                  <Minus size={12} />
                </button>
                <span className="w-6 text-center tabular-nums text-text-primary font-semibold text-sm">
                  {card.quantity}
                </span>
                <button
                  type="button"
                  onClick={onInc}
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary"
                  title="Add one"
                  aria-label="Increase quantity"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
            <div className="border-t border-border-subtle my-1" />

            {isMtg && (
              <MenuItem
                icon={<Layers size={13} />}
                label="Change printing"
                onClick={runAndClose(onChangePrinting)}
              />
            )}
            {isCommander && (
              <MenuItem
                icon={<Crown size={13} className={cardIsCommander ? 'text-warning' : ''} />}
                label={cardIsCommander ? 'Unmark as commander' : 'Mark as commander'}
                onClick={runAndClose(() => onSetCommander(!cardIsCommander))}
              />
            )}
            {isSideboard ? (
              <MenuItem
                icon={<PackageOpen size={13} />}
                label="Move to main"
                onClick={runAndClose(() => onSetCategory('main'))}
              />
            ) : (
              <MenuItem
                icon={<Archive size={13} />}
                label="Move to sideboard"
                onClick={runAndClose(() => onSetCategory('sideboard'))}
                disabled={cardIsCommander}
              />
            )}

            <div className="border-t border-border-subtle my-1" />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="Remove"
              danger
              onClick={runAndClose(onDelete)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={[
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
        disabled
          ? 'text-text-muted opacity-40 cursor-not-allowed'
          : danger
            ? 'text-danger hover:bg-red-500/10'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
      ].join(' ')}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
