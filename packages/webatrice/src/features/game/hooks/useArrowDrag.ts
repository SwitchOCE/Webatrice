import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { ZoneNameValue } from '@cockatrice/sockatrice';

import { rgbaToCss, type ColorRGBA } from '@app/types';
import type { ArrowTarget } from '../components/ui/PlayerBoard/playerBoard.types';
import { makeCardKey, makePlayerKey, parseCardKey, type CardRegistry } from '../utils/CardRegistry/CardRegistryContext';
import { arrowColorForModifiers, type ArrowSource } from './arrowResolution';

/** Right-button motion (|dx| + |dy|, px) before a press becomes an arrow drag
 *  instead of opening the context menu. */
const ARROW_DRAG_THRESHOLD_PX = 4;

const CARD_SELECTOR = '[data-card-id][data-card-owner][data-card-zone]';
const PLAYER_SELECTOR = '[data-arrow-target-kind="player"]';

/** The card element under `el`, by the data attributes every arrow-capable card carries. */
export function arrowCardAt(el: Element | null | undefined): ArrowSource | null {
  const cardEl = el?.closest(CARD_SELECTOR);
  if (!cardEl) {
    return null;
  }
  const playerId = Number(cardEl.getAttribute('data-card-owner'));
  const zone = cardEl.getAttribute('data-card-zone') as ZoneNameValue;
  const cardId = Number(cardEl.getAttribute('data-card-id'));
  return Number.isFinite(playerId) && zone && Number.isFinite(cardId) ? { playerId, zone, cardId } : null;
}

/** What an arrow released over `el` points at: a card, else a player's life
 *  total, else nothing. */
export function arrowTargetAt(el: Element | null | undefined): ArrowTarget | null {
  const card = arrowCardAt(el);
  if (card) {
    return { kind: 'card', ...card };
  }
  const playerEl = el?.closest(PLAYER_SELECTOR);
  const playerId = Number(playerEl?.getAttribute('data-arrow-target-player-id') ?? NaN);
  return playerEl && Number.isFinite(playerId) ? { kind: 'player', playerId } : null;
}

export const arrowTargetKey = (target: ArrowTarget) =>
  target.kind === 'card' ? makeCardKey(target.playerId, target.zone, target.cardId) : makePlayerKey(target.playerId);

interface Modifiers {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface ArrowDragState extends Modifiers {
  source: ArrowSource;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

export interface ArrowDragPreview {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  /** True when the pointer is currently over a valid arrow target. Mirrors
   *  Cockatrice's `ArrowDragItem::fullColor`, which paints α=200 (targeted)
   *  vs α=150 (untargeted) on the exact same shape. Consumed by
   *  GameArrowOverlay to switch the fill alpha. */
  fullColor: boolean;
}

export interface UseArrowDragArgs {
  containerRef: RefObject<HTMLDivElement>;
  cardRegistry: CardRegistry;
  /** A drag released over a target; the colour follows the held modifier. */
  onDrop: (source: ArrowSource, target: ArrowTarget, color: ColorRGBA) => void;
}

export interface ArrowDrag {
  /** The dragged card's key while a drag is in progress. */
  sourceKey: string | null;
  /** The card or player under the pointer, once the press became a drag. */
  targetKey: string | null;
  preview: ArrowDragPreview | null;
  handleBoardMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function exceedsThreshold(drag: ArrowDragState, e: MouseEvent): boolean {
  return drag.moved || Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > ARROW_DRAG_THRESHOLD_PX;
}

function elementFor(cardRegistry: CardRegistry, key: string): HTMLElement | null {
  const registered = cardRegistry.get(key);
  if (registered) {
    return registered;
  }
  // The seat tags its cards with data attributes but does not register them.
  const card = parseCardKey(key);
  if (card) {
    return document.querySelector<HTMLElement>(
      `[data-card-id="${CSS.escape(String(card.cardId))}"][data-card-owner="${CSS.escape(
        String(card.playerId),
      )}"][data-card-zone="${CSS.escape(card.zone)}"]`,
    );
  }
  if (key.startsWith('player:')) {
    return document.querySelector<HTMLElement>(
      `${PLAYER_SELECTOR}[data-arrow-target-player-id="${CSS.escape(key.slice('player:'.length))}"]`,
    );
  }
  return null;
}

/**
 * The right-button arrow drag (desktop CardItem::mouseMoveEvent →
 * ArrowDragItem): a right press on a card that moves past the threshold draws
 * a live arrow to the pointer, snapped to the card or player under it, and
 * hands the release to `onDrop`. A press that never moves leaves the context
 * menu to open. Pointer and hit-testing only: what the drop sends is the
 * caller's.
 */
export function useArrowDrag({ containerRef, cardRegistry, onDrop }: UseArrowDragArgs): ArrowDrag {
  const [drag, setDrag] = useState<ArrowDragState | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);

  // Escape cancels the drag, unless a MUI dialog has it first.
  useEffect(() => {
    if (!drag) {
      return undefined;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.MuiDialog-root[role="dialog"]')) {
        return;
      }
      setDrag(null);
      setTargetKey(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drag]);

  useEffect(() => {
    if (!drag) {
      return undefined;
    }

    const handleMove = (e: MouseEvent) => {
      setDrag((prev) => {
        if (!prev) {
          return prev;
        }
        const moved = exceedsThreshold(prev, e);
        if (moved) {
          const target = arrowTargetAt(document.elementFromPoint(e.clientX, e.clientY));
          const key = target ? arrowTargetKey(target) : null;
          const sourceKey = makeCardKey(prev.source.playerId, prev.source.zone, prev.source.cardId);
          setTargetKey(key === sourceKey ? null : key);
        }
        // The modifiers are refreshed on every move, so pressing one mid-drag
        // recolours the preview at once.
        return {
          ...prev,
          currentX: e.clientX,
          currentY: e.clientY,
          moved,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
        };
      });
    };

    const handleUp = (e: MouseEvent) => {
      if (e.button !== 2) {
        return;
      }
      setDrag(null);
      setTargetKey(null);
      if (!exceedsThreshold(drag, e)) {
        // A right click without a drag: the contextmenu handler opens the card menu.
        return;
      }
      // Any real drag suppresses the contextmenu event that follows mouseup.
      // Capture phase + stopPropagation keep it from React's delegated root
      // listener, which would open the card menu.
      window.addEventListener(
        'contextmenu',
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        },
        { once: true, capture: true },
      );
      const target = arrowTargetAt(document.elementFromPoint(e.clientX, e.clientY));
      if (target) {
        // The colour comes from the modifiers held at release.
        onDrop(drag.source, target, arrowColorForModifiers(e));
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, onDrop]);

  const handleBoardMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 2) {
      return;
    }
    const source = arrowCardAt(e.target as Element);
    if (!source) {
      return;
    }
    setDrag({
      source,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      moved: false,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    });
  }, []);

  // Viewport → board-relative coordinates for the SVG preview line.
  const preview = useMemo<ArrowDragPreview | null>(() => {
    if (!drag || !drag.moved) {
      return null;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    const sourceEl = elementFor(cardRegistry, makeCardKey(drag.source.playerId, drag.source.zone, drag.source.cardId));
    if (!containerRect || !sourceEl) {
      return null;
    }
    const sourceRect = sourceEl.getBoundingClientRect();

    // Endpoint snapping, as desktop's ArrowDragItem::updatePath(): over a
    // target the shaft locks to its centre (a card, or a player's life
    // total); otherwise it follows the pointer.
    let x2 = drag.currentX - containerRect.left;
    let y2 = drag.currentY - containerRect.top;
    const targetEl = targetKey ? elementFor(cardRegistry, targetKey) : null;
    if (targetEl) {
      const t = targetEl.getBoundingClientRect();
      x2 = t.left + t.width / 2 - containerRect.left;
      y2 = t.top + t.height / 2 - containerRect.top;
    }

    return {
      x1: sourceRect.left + sourceRect.width / 2 - containerRect.left,
      y1: sourceRect.top + sourceRect.height / 2 - containerRect.top,
      x2,
      y2,
      // The colour the arrow would have if released now.
      color: rgbaToCss(arrowColorForModifiers(drag)),
      fullColor: targetKey != null,
    };
  }, [drag, targetKey, cardRegistry, containerRef]);

  return {
    sourceKey: drag ? makeCardKey(drag.source.playerId, drag.source.zone, drag.source.cardId) : null,
    targetKey,
    preview,
    handleBoardMouseDown,
  };
}
