import { useCallback, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { isContextMenuKey } from '@app/components';
import { tabbableElements, useGridRows, type ListOrientation } from '@app/hooks';

import { makeCardKey, useCardRegistry } from '../../../utils/CardRegistry/CardRegistryContext';
import { useCardPreviewActions, type PreviewCard } from '../CardPreviewContext';

export interface CardFocusOptions<C extends { id: string }> {
  /** The wire zone the cards are in, for the card registry the arrows read. */
  zone: string;
  /** The zone's cards, in the order the arrows walk them (along each line). */
  cards: readonly C[];
  /** ←/→ for a row of cards (a hand row), ↑/↓ for a pile (the stack, a hand column). */
  orientation: ListOrientation;
  /** A two-dimensional zone (the battlefield): card ids by visual line, top to bottom. */
  lines?: readonly (readonly string[])[];
  /** The player whose zone the card is in (a cross-player attachment's owner). */
  ownerOf: (card: C) => number;
  /** The card's accessible name: its name and what the board shows of its state. */
  labelOf: (card: C) => string;
  /** What the preview pane shows while the card has keyboard focus; null shows nothing (face down). */
  previewOf: (card: C) => PreviewCard | null;
  /** The zone's selected cards, and the selection's replacement (never empty). */
  selectedIds: ReadonlySet<string>;
  onSelectIds: (ids: Set<string>) => void;
  /** Enter: desktop's click-to-play (tap, untap, play), or a pending target pick, on the card's
   *  element. Nothing when unset. */
  onActivate?: (card: C, element: HTMLElement) => void;
  /** Shift+F10 or the Menu key: the card's context menu, under the card. */
  onOpenMenu: (card: C, rect: DOMRect) => void;
  /** Keyboard focus came to a card of the zone (true) or left it (false): the hand expands, as on hover. */
  onKeyboardFocus?: (focused: boolean) => void;
}

/** The props a focusable card spreads onto its element. */
export interface CardFocusProps {
  ref: (element: HTMLElement | null) => void;
  tabIndex: number;
  role: 'option';
  'aria-selected': boolean;
  'aria-label': string;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onPointerDownCapture: () => void;
}

/** The key that zooms the focused card while held: the keyboard's middle-button hold. */
export const ZOOM_KEY = 'z';

/**
 * F6 and Shift+F6 leave a card zone: focus moves to the next (previous) tab
 * stop on the page, as Tab does anywhere else. On a card Tab stays desktop's
 * Next Phase.
 */
export function focusPastZone(from: HTMLElement, backwards: boolean): void {
  tabStopPast(from, backwards)?.focus();
}

function tabStopPast(from: HTMLElement, backwards: boolean): HTMLElement | undefined {
  const stops = tabbableElements(document.body);
  const index = stops.indexOf(from);
  return backwards ? stops[index - 1] ?? stops[stops.length - 1] : stops[index + 1] ?? stops[0];
}

/**
 * The keyboard model of one zone's cards, on the board or in a zone view
 * (desktop has none: there every card is pointer-only). The zone is a listbox with one roving tab stop
 * (useGridRows): the arrows move focus and select the card they land on,
 * Shift with an arrow extends the selection, Space selects, Enter plays or taps
 * it as a click does, Shift+F10 or the Menu key open its menu, holding Z zooms
 * it, and F6 leaves the zone. Keyboard focus shows the card in the preview pane.
 * Tab is left to the shortcut layer, where it is Next Phase as on desktop.
 */
export function useCardFocus<C extends { id: string }>({
  zone,
  cards,
  orientation,
  lines,
  ownerOf,
  labelOf,
  previewOf,
  selectedIds,
  onSelectIds,
  onActivate,
  onOpenMenu,
  onKeyboardFocus,
}: CardFocusOptions<C>) {
  const { setFocusedCard, openBigPreview, closeBigPreview } = useCardPreviewActions();
  const registry = useCardRegistry();
  const keys = lines ? lines.flat() : cards.map((card) => card.id);
  const byId = new Map(cards.map((card) => [card.id, card] as const));
  // The card focus was last on holds the zone's tab stop; before that, the
  // first selected card.
  const [current, setCurrent] = useState<string | null>(null);
  const tabStop = current != null && byId.has(current)
    ? current
    : keys.find((key) => selectedIds.has(key)) ?? null;
  // Where a Shift+arrow range starts: the last card selected on its own.
  const anchor = useRef<string | null>(null);
  // A press focuses the card too; only keyboard focus drives the preview.
  const pointerFocus = useRef(false);
  const zooming = useRef(false);
  const elements = useRef(new Map<string, HTMLElement>());

  const select = useCallback((key: string) => {
    anchor.current = key;
    onSelectIds(new Set([key]));
  }, [onSelectIds]);

  // Space marks or unmarks the focused card and keeps the rest of the
  // selection, as Ctrl+click does; with Ctrl+arrows moving focus alone, that
  // builds a selection with gaps.
  const toggle = useCallback((key: string) => {
    anchor.current = key;
    const next = new Set(selectedIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectIds(next);
  }, [selectedIds, onSelectIds]);

  const extend = useCallback((key: string) => {
    const from = keys.indexOf(anchor.current ?? current ?? key);
    const to = keys.indexOf(key);
    const [lo, hi] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
    onSelectIds(new Set(keys.slice(lo, hi + 1)));
  }, [keys, current, onSelectIds]);

  const rows = useGridRows({
    keys,
    selectedKey: tabStop,
    onSelect: select,
    onActivate: (key) => {
      const card = byId.get(key);
      const element = elements.current.get(key);
      if (card && element) {
        onActivate?.(card, element);
      }
    },
    orientation,
    lines,
    onExtend: extend,
    focusOnlyWithCtrl: true,
    // The zone's last card leaving (the hand played out) moves focus on to
    // the next tab stop, as F6 would, rather than dropping it to the page,
    // where Tab is Next Phase.
    keepFocusOnRemoval: (removed) => tabStopPast(removed, false),
  });

  const endZoom = () => {
    if (zooming.current) {
      zooming.current = false;
      closeBigPreview();
    }
  };

  const cardProps = (card: C): CardFocusProps => {
    const row = rows.getRowProps(card.id);
    const registryKey = makeCardKey(ownerOf(card), zone, Number(card.id));
    return {
      ref: (element) => {
        row.ref(element);
        if (element) {
          elements.current.set(card.id, element);
          registry?.register(registryKey, element);
        } else {
          elements.current.delete(card.id);
          registry?.unregister(registryKey);
        }
      },
      tabIndex: row.tabIndex,
      role: 'option',
      'aria-selected': selectedIds.has(card.id),
      'aria-label': labelOf(card),
      onKeyDown: (event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (isContextMenuKey(event)) {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(card, event.currentTarget.getBoundingClientRect());
          return;
        }
        if (event.key === 'F6' && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          focusPastZone(event.currentTarget, event.shiftKey);
          return;
        }
        if (event.key.toLowerCase() === ZOOM_KEY && !event.ctrlKey && !event.altKey && !event.metaKey) {
          const preview = previewOf(card);
          if (preview && !event.repeat) {
            zooming.current = true;
            openBigPreview(preview);
          }
          event.preventDefault();
          return;
        }
        // Shift+Enter is the chat's focus shortcut.
        if (event.key === 'Enter' && event.shiftKey) {
          return;
        }
        // Ctrl+Space is Next Phase; plain Space toggles the card.
        if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault();
          toggle(card.id);
          return;
        }
        row.onKeyDown(event);
      },
      onKeyUp: (event) => {
        if (event.key.toLowerCase() === ZOOM_KEY) {
          endZoom();
        }
      },
      onFocus: (event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        setCurrent(card.id);
        if (pointerFocus.current) {
          pointerFocus.current = false;
          return;
        }
        setFocusedCard(previewOf(card));
        onKeyboardFocus?.(true);
      },
      onBlur: (event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        endZoom();
        setFocusedCard(null);
        onKeyboardFocus?.(false);
      },
      onPointerDownCapture: () => {
        pointerFocus.current = true;
        // A press that never focuses the card (a drag) must not swallow the next keyboard focus.
        window.setTimeout(() => {
          pointerFocus.current = false;
        }, 0);
      },
    };
  };

  return { cardProps };
}
