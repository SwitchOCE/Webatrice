import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';

import { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { resolveSelectedCards } from '../../../utils/selection';
import {
  COUNTER_TYPE_COUNT,
  COUNTER_TYPE_LABELS,
  counterColorForId,
} from '../../ui/CardSlot/counterColors';

import NestedMenuItem from './NestedMenuItem';
import { useGameDialogsContext } from '../../ui/GameDialogsContext';
import { useGameId } from '../../ui/GameIdContext';
import { useCardVisualState } from '../../ui/CardVisualStateContext';
import { useLocalIdentity } from '../../../hooks/useLocalIdentity';
import { useCurrentGame } from '../../../hooks/useCurrentGame';
import { useCardContextMenu } from './useCardContextMenu';
import type { CardMenuItem } from './cardContextMenu.model';
import { useViewportClampedMenu } from '../useViewportClampedMenu';

import './CardContextMenu.css';
import { usePreference } from '@app/hooks';

const COUNTER_TYPE_IDS: ReadonlyArray<number> = Array.from(
  { length: COUNTER_TYPE_COUNT },
  (_, i) => i,
);

function hasCounter(card: ServerInfo_Card, counterId: number): boolean {
  return card.counterList.some((c) => c.id === counterId && c.value > 0);
}

function CardContextMenu() {
  const dialogs = useGameDialogsContext();
  const gameId = useGameId();
  const { localPlayerId } = useLocalIdentity();
  const { selectedCardKeys } = useCardVisualState();
  const cardMenu = dialogs.cardMenu;
  const isOpen = cardMenu != null;
  const anchorPosition = cardMenu?.anchorPosition ?? null;
  const card = cardMenu?.card ?? null;

  // Resolve the multi-selection to live cards for bulk actions (was computed in
  // Game via the same helper and passed as a prop).
  const { game } = useCurrentGame(gameId);
  const selectedCards = useMemo(
    () => (game ? resolveSelectedCards(game, selectedCardKeys) : []),
    [game, selectedCardKeys],
  );

  const {
    ready,
    canActOnCard,
    canAttach,
    isAttached,
    canPlay,
    canPeek,
    moveTargets,
    handleTapToggle,
    handleFaceDownToggle,
    handleDoesntUntapToggle,
    handleSetPT,
    handleSetAnnotation,
    handleCardCounterDelta,
    handleSetCardCounter,
    handleDrawArrow,
    handleAttach,
    handleUnattach,
    handlePlay,
    handlePlayFaceDown,
    handlePeek,
    handleMove,
    handleMoveToLibraryAt,
  } = useCardContextMenu({
    gameId,
    localPlayerId: localPlayerId ?? null,
    card,
    ownerPlayerId: cardMenu?.sourcePlayerId ?? null,
    sourceZone: cardMenu?.sourceZone ?? null,
    selectedCards,
    onClose: dialogs.closeCardMenu,
    onRequestSetPT: dialogs.handleRequestSetPT,
    onRequestSetAnnotation: dialogs.handleRequestSetAnnotation,
    onRequestSetCounter: dialogs.handleRequestSetCardCounter,
    onRequestDrawArrow: dialogs.handleRequestDrawArrow,
    onRequestAttach: dialogs.handleRequestAttach,
    onRequestPlay: dialogs.handleRequestPlayFromCardMenu,
    onRequestMoveToLibraryAt: dialogs.handleRequestMoveToLibraryAt,
  });

  if (!ready || !card) {
    return null;
  }

  return (
    <Menu
      open={isOpen}
      onClose={dialogs.closeCardMenu}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      data-testid="card-context-menu"
      className="card-context-menu"
    >
      {canPlay && (
        <>
          <MenuItem onClick={handlePlay}>Play</MenuItem>
          <MenuItem onClick={handlePlayFaceDown}>Play face down</MenuItem>
          <Divider />
        </>
      )}
      {canActOnCard && (
        <>
          <MenuItem onClick={handleTapToggle}>{card.tapped ? 'Untap' : 'Tap'}</MenuItem>
          <MenuItem onClick={handleFaceDownToggle}>
            {card.faceDown ? 'Face Up' : 'Face Down'}
          </MenuItem>
          {canPeek && <MenuItem onClick={handlePeek}>Peek</MenuItem>}
          <MenuItem onClick={handleDoesntUntapToggle}>
            {card.doesntUntap ? 'Allow Untap' : 'Doesn\'t Untap'}
          </MenuItem>
          <MenuItem onClick={handleSetPT}>Set P/T…</MenuItem>
          <MenuItem onClick={handleSetAnnotation}>Set Annotation…</MenuItem>
          <Divider />
          <NestedMenuItem label="Counters" parentMenuOpen={isOpen}>
            {COUNTER_TYPE_IDS.map((id) => (
              <NestedMenuItem
                key={`counter-${id}`}
                parentMenuOpen={isOpen}
                label={
                  <>
                    <span
                      className="card-context-menu__counter-chip"
                      style={{ background: counterColorForId(id) }}
                      aria-hidden="true"
                    />
                    {COUNTER_TYPE_LABELS[id]}
                  </>
                }
              >
                <MenuItem onClick={() => handleCardCounterDelta(id, +1)}>
                  Add Counter
                </MenuItem>
                <MenuItem
                  onClick={() => handleCardCounterDelta(id, -1)}
                  disabled={!hasCounter(card, id)}
                >
                  Remove Counter
                </MenuItem>
                <MenuItem onClick={() => handleSetCardCounter(id)}>
                  Set Counter…
                </MenuItem>
              </NestedMenuItem>
            ))}
          </NestedMenuItem>
          <Divider />
        </>
      )}
      <MenuItem onClick={handleDrawArrow}>Draw arrow from here</MenuItem>
      {canActOnCard && canAttach && (
        <MenuItem onClick={handleAttach}>Attach to card…</MenuItem>
      )}
      {canActOnCard && canAttach && isAttached && (
        <MenuItem onClick={handleUnattach}>Unattach</MenuItem>
      )}
      {canActOnCard && (
        <>
          <Divider />
          {moveTargets.map((t) => (
            <MenuItem key={t.label} onClick={() => handleMove(t)}>
              {t.label}
            </MenuItem>
          ))}
          <MenuItem onClick={handleMoveToLibraryAt}>
            Move to library at position…
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

export default memo(CardContextMenu);

export interface CardMenuPopupProps {
  /** The menu model (`buildCardContextMenu` and the seat's per-zone item lists). */
  items: CardMenuItem[];
  /** Viewport point the menu opens at; it is clamped into the viewport. */
  anchor: { x: number; y: number };
  /** The card has no server id yet: rows without an action render disabled. */
  disabled: boolean;
  /** Outside click or Escape. Items close the menu themselves when they fire. */
  onClose: () => void;
}

/**
 * Renders a card menu model: the seat's battlefield, stack and pile-view card
 * menus. Portals to `document.body`, flips submenus at the viewport edge, and
 * closes on an outside mousedown or Escape (armed on the next tick, so the
 * right-click that opened it doesn't close it).
 *
 * z-[1200] sits above the pile-view dialog (z-[1000]), whose cards open this
 * menu, and below MUI dialogs (1300), which the menu's items open.
 */
export function CardMenuPopup({ items, anchor, disabled, onClose }: CardMenuPopupProps) {
  const [openSubmenu, setOpenSubmenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const { ref: mainRef, position: mainPos } = useViewportClampedMenu(anchor.x, anchor.y);
  // Desktop's "Show keyboard shortcuts in right-click menus".
  const showShortcuts = usePreference('showShortcutsInMenus');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-card-context-menu]')) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const renderItems = (
    list: CardMenuItem[],
    keyPrefix: string,
    onItemHover: (i: number, e: React.MouseEvent<HTMLButtonElement>) => void,
  ) =>
    list.map((item, i) => {
      if ('divider' in item) {
        return (
          <div
            key={`${keyPrefix}-d-${i}`}
            className="my-1 border-t border-border-subtle"
          />
        );
      }
      const hasSubmenu = !!item.submenu;
      return (
        <button
          key={`${keyPrefix}-i-${i}`}
          disabled={disabled && !hasSubmenu && !item.onClick}
          onMouseEnter={(e) => onItemHover(i, e)}
          onClick={item.onClick}
          className={[
            'w-full flex items-center gap-3 px-3 py-1.5 text-sm text-left text-text-primary',
            'hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed board-motion transition-colors',
          ].join(' ')}
        >
          {item.swatch !== undefined ? (
            <span
              className="inline-block rounded-full shrink-0"
              style={{
                width: 10,
                height: 10,
                background: item.swatch,
              }}
              aria-hidden
            />
          ) : (
            <span
              className="inline-block shrink-0 text-center text-accent"
              style={{ width: 10 }}
              aria-hidden
            >
              {item.checked ? '✓' : ''}
            </span>
          )}
          <span className="flex-1 truncate">{item.label}</span>
          {showShortcuts && item.shortcut && (
            <span className="text-xs text-text-muted">{item.shortcut}</span>
          )}
          {hasSubmenu && (
            <span className="text-text-muted text-xs" aria-hidden>
              ▶
            </span>
          )}
        </button>
      );
    });

  return createPortal(
    <>
      <div
        ref={mainRef}
        data-card-context-menu
        className="fixed z-[1200] min-w-[220px] rounded-md border border-border-subtle bg-bg-surface shadow-glow py-1"
        style={{ left: mainPos.x, top: mainPos.y }}
      >
        {renderItems(items, 'top', (i, e) => {
          const item = items[i];
          if ('divider' in item) {
            return;
          }
          if (item.submenu) {
            const rect = e.currentTarget.getBoundingClientRect();
            setOpenSubmenu({ index: i, x: rect.right, y: rect.top });
          } else {
            setOpenSubmenu(null);
          }
        })}
      </div>
      {openSubmenu !== null &&
        (() => {
          const parent = items[openSubmenu.index];
          if ('divider' in parent || !parent.submenu) {
            return null;
          }
          return (
            <CardMenuFlyout anchorX={openSubmenu.x} anchorY={openSubmenu.y}>
              {renderItems(parent.submenu, `sub-${openSubmenu.index}`, () => {
                /* nested submenus not used by any current menu */
              })}
            </CardMenuFlyout>
          );
        })()}
    </>,
    document.body,
  );
}

/** A submenu: opens beside its parent row, or to its left at the viewport edge. */
function CardMenuFlyout({
  anchorX,
  anchorY,
  children,
}: {
  anchorX: number;
  anchorY: number;
  children: React.ReactNode;
}) {
  const { ref, position } = useViewportClampedMenu(anchorX, anchorY);
  return (
    <div
      ref={ref}
      data-card-context-menu
      className="fixed z-[1201] min-w-[260px] rounded-md border border-border-subtle bg-bg-surface shadow-glow py-1"
      style={{ left: position.x, top: position.y }}
    >
      {children}
    </div>
  );
}
