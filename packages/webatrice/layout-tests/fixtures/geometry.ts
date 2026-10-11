import type { Page } from '@playwright/test';

export interface BoardReport {
  seats: number;
  cards: number;
  cardWidthPx: number;
  minScale: boolean;
  violations: string[];
}

export function boardReport(page: Page): Promise<BoardReport> {
  return page.evaluate(() => {
    const TOL = 1.5;
    const MIN_CARD_WIDTH_PX = 72 * 0.5;
    const violations: string[] = [];
    type Box = { left: number; top: number; right: number; bottom: number };
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const fmt = (b: Box) => `[${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}]`;
    const inside = (inner: Box, outer: Box) =>
      inner.left >= outer.left - TOL && inner.right <= outer.right + TOL
      && inner.top >= outer.top - TOL && inner.bottom <= outer.bottom + TOL;
    const clientBox = (el: HTMLElement): Box => {
      const r = el.getBoundingClientRect();
      const left = r.left + el.clientLeft;
      const top = r.top + el.clientTop;
      return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
    };
    const scrolls = (value: string) => value === 'auto' || value === 'scroll';
    const reachable = (el: Element, scroller: HTMLElement): boolean => {
      const view = clientBox(scroller);
      const r = box(el);
      const style = getComputedStyle(scroller);
      const x0 = r.left - view.left + scroller.scrollLeft;
      const x1 = r.right - view.left + scroller.scrollLeft;
      const y0 = r.top - view.top + scroller.scrollTop;
      const y1 = r.bottom - view.top + scroller.scrollTop;
      const okX = scrolls(style.overflowX)
        ? x0 >= -TOL && x1 <= scroller.scrollWidth + TOL
        : r.left >= view.left - TOL && r.right <= view.right + TOL;
      const okY = scrolls(style.overflowY)
        ? y0 >= -TOL && y1 <= scroller.scrollHeight + TOL
        : r.top >= view.top - TOL && r.bottom <= view.bottom + TOL;
      return okX && okY;
    };
    const visibleIn = (el: Element, scroller: HTMLElement) => inside(box(el), clientBox(scroller));

    const cardWidthPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-width')) || 72;
    const minScale = cardWidthPx <= MIN_CARD_WIDTH_PX + 0.01;
    const board = document.querySelector<HTMLElement>('[data-game-board]');
    if (!board) {
      return { seats: 0, cards: 0, cardWidthPx, minScale, violations: ['no game board'] };
    }
    const boardBox = clientBox(board);
    const seats = [...board.querySelectorAll<HTMLElement>('[role="region"]')]
      .filter((el) => el.querySelector('[data-battlefield-owner]'));
    let cards = 0;

    seats.forEach((seat, i) => {
      const name = seat.getAttribute('aria-label') ?? `seat ${i}`;
      const seatBox = box(seat);
      if (!inside(seatBox, boardBox)) {
        violations.push(`${name} ${fmt(seatBox)} is outside the board ${fmt(boardBox)}`);
      }
      seats.slice(i + 1).forEach((other) => {
        const o = box(other);
        const w = Math.min(seatBox.right, o.right) - Math.max(seatBox.left, o.left);
        const h = Math.min(seatBox.bottom, o.bottom) - Math.max(seatBox.top, o.top);
        if (w > TOL && h > TOL) {
          violations.push(`${name} overlaps ${other.getAttribute('aria-label')} by ${Math.round(w)}x${Math.round(h)}`);
        }
      });

      const scroller = seat.querySelector<HTMLElement>('[data-battlefield-owner]')!;
      const scrollerBox = box(scroller);
      if (!inside(scrollerBox, seatBox)) {
        violations.push(`${name}: battlefield ${fmt(scrollerBox)} spills out of the seat ${fmt(seatBox)}`);
      }
      const view = clientBox(scroller);
      for (const card of scroller.querySelectorAll<HTMLElement>('[data-card]')) {
        cards += 1;
        const label = card.getAttribute('aria-label') ?? card.dataset.cardId;
        const r = box(card);
        const verticallyVisible = r.top >= view.top - TOL && r.bottom <= view.bottom + TOL;
        if (!reachable(card, scroller)) {
          violations.push(`${name}: card "${label}" ${fmt(r)} can't be reached in ${fmt(view)}`);
        } else if (!verticallyVisible && !minScale) {
          violations.push(`${name}: card "${label}" ${fmt(r)} is cropped vertically by ${fmt(view)}`);
        }
      }

      const life = seat.querySelector<HTMLElement>('[data-arrow-target-kind="player"]');
      const info = [...seat.children].find((child) => life && child.contains(life)) as HTMLElement | undefined;
      if (!life || !info) {
        violations.push(`${name}: no info column`);
        return;
      }
      const infoBox = box(info);
      if (!inside(infoBox, seatBox)) {
        violations.push(`${name}: info column ${fmt(infoBox)} spills out of the seat ${fmt(seatBox)}`);
      }
      const controls = [
        life,
        ...info.querySelectorAll<HTMLElement>('[role="group"], [data-pile-count], button'),
      ];
      for (const control of controls) {
        const label = control.getAttribute('aria-label') ?? control.getAttribute('title') ?? control.tagName;
        const r = box(control);
        if (r.right - r.left < 1 || r.bottom - r.top < 1) {
          continue;
        }
        if (visibleIn(control, info)) {
          continue;
        }
        if (minScale && reachable(control, info)) {
          continue;
        }
        violations.push(`${name}: info control "${label}" ${fmt(r)} is clipped by ${fmt(clientBox(info))}`);
      }
    });

    return { seats: seats.length, cards, cardWidthPx, minScale, violations };
  });
}

export interface DockItem {
  kind: 'window' | 'chip';
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  reachable: boolean;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TrayTarget extends Rect {
  label: string;
}

export interface DockReport {
  viewport: { width: number; height: number };
  items: DockItem[];
  region: Rect | null;
  chipStrip: Rect | null;
  sidebar: Rect | null;
  gameInput: Rect | null;
  trayControls: TrayTarget[];
  handView: Rect | null;
  handCards: (TrayTarget & { reachable: boolean })[];
  tray: (Rect & { keep: number }) | null;
}

export function dockReport(page: Page): Promise<DockReport> {
  return page.evaluate(() => {
    const TOL = 1.5;
    const region = document.querySelector<HTMLElement>('[role="region"][aria-label="Private chats"]');
    const items: DockItem[] = [];
    const scrollerOf = (el: HTMLElement): HTMLElement | null => {
      let node = el.parentElement;
      while (node && node !== region?.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };
    const reachable = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const scroller = scrollerOf(el);
      if (!scroller) {
        return r.left >= -TOL && r.right <= window.innerWidth + TOL;
      }
      const s = scroller.getBoundingClientRect();
      const x0 = r.left - s.left + scroller.scrollLeft;
      const x1 = r.right - s.left + scroller.scrollLeft;
      return x0 >= -TOL && x1 <= scroller.scrollWidth + TOL && s.left >= -TOL && s.right <= window.innerWidth + TOL;
    };
    const push = (kind: DockItem['kind'], name: string, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      items.push({ kind, name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, reachable: reachable(el) });
    };
    if (region) {
      for (const section of region.querySelectorAll<HTMLElement>('section[aria-label^="Chat with "]')) {
        push('window', section.getAttribute('aria-label')!.slice('Chat with '.length), section);
      }
      for (const button of region.querySelectorAll<HTMLElement>('button[aria-label^="Open chat with "]')) {
        push('chip', button.getAttribute('aria-label')!.slice('Open chat with '.length), button.parentElement!);
      }
    }
    const rect = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const tray = document.querySelector<HTMLElement>('[data-testid="board-tray"]');
    const trayControls = [...(tray?.querySelectorAll<HTMLElement>('button, [role="button"]') ?? [])]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, ...rect(el)! }));
    const handScroller = tray?.querySelector<HTMLElement>('[data-tray-flex] [role="listbox"]') ?? null;
    const handView = handScroller ? (() => {
      const r = handScroller.getBoundingClientRect();
      const left = r.left + handScroller.clientLeft;
      return { left, top: r.top, right: left + handScroller.clientWidth, bottom: r.bottom };
    })() : null;
    const handCards = [...(handScroller?.querySelectorAll<HTMLElement>('[data-card]') ?? [])].map((card) => {
      const r = card.getBoundingClientRect();
      const x0 = r.left - handView!.left + handScroller!.scrollLeft;
      const x1 = r.right - handView!.left + handScroller!.scrollLeft;
      return {
        label: card.getAttribute('aria-label') ?? card.dataset.cardId ?? 'card',
        ...rect(card)!,
        reachable: x0 >= -TOL && x1 <= handScroller!.scrollWidth + TOL,
      };
    });
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      items,
      region: rect(region),
      chipStrip: rect(region?.querySelector('button[aria-label^="Open chat with "]')?.parentElement?.parentElement),
      sidebar: rect(document.querySelector('[data-chat-dock-avoid]')),
      gameInput: rect(document.querySelector('[data-testid="game-log"] input')),
      trayControls,
      handView,
      handCards,
      tray: tray ? { ...rect(tray)!, keep: Number(tray.getAttribute('data-chat-dock-keep')) || 0 } : null,
    };
  });
}

export function overlaps(a: Rect, b: Rect, tol = 1.5): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tol
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tol;
}

const DOCK_MARGIN_PX = 12;
const CHIP_MIN_PX = 160;
const WINDOW_PX = 300;
const GAP_PX = 8;

export function dockViolations(report: DockReport): string[] {
  const out: string[] = [];
  const { viewport, items } = report;
  const name = (item: DockItem) => `${item.kind} ${item.name}`;
  const strip = report.chipStrip;
  const shown = (item: DockItem): Rect | null => {
    if (item.kind !== 'chip' || !strip) {
      return item;
    }
    const clipped = {
      left: Math.max(item.left, strip.left),
      top: item.top,
      right: Math.min(item.right, strip.right),
      bottom: item.bottom,
    };
    return clipped.right - clipped.left > 1.5 ? clipped : null;
  };
  const anchor = (report.sidebar ? report.sidebar.left : viewport.width) - DOCK_MARGIN_PX;
  const tray = report.tray;
  const freeRoom = tray ? anchor - (tray.left + tray.keep) : Infinity;
  const hasChips = items.some((item) => item.kind === 'chip');
  const lifted = tray !== null && items.length > 0 && items.every((item) => Math.abs(item.bottom - tray.top) <= 1.5);
  if (lifted && WINDOW_PX + (hasChips ? CHIP_MIN_PX + GAP_PX : 0) <= freeRoom) {
    out.push(`the dock sits on the tray although ${Math.round(freeRoom)}px beside the tray controls would hold it`);
  }
  if (!lifted && tray && report.region && report.region.left < tray.left + tray.keep - 1.5) {
    out.push(`the dock reaches ${Math.round(tray.left + tray.keep - report.region.left)}px into the tray's controls and minimum hand`);
  }
  const baseline = lifted && tray ? tray.top : viewport.height;
  for (const item of items) {
    if (Math.abs(item.bottom - baseline) > 1.5) {
      const edge = lifted ? 'tray top' : 'bottom edge';
      out.push(`${name(item)}: bottom ${Math.round(item.bottom)} is off the ${edge} ${Math.round(baseline)}`);
    }
    if (!item.reachable) {
      out.push(`${name(item)}: [${Math.round(item.left)}–${Math.round(item.right)}] is off screen`);
    }
    const box = shown(item);
    if (!box) {
      continue;
    }
    if (report.gameInput && overlaps(box, report.gameInput)) {
      out.push(`${name(item)}: covers the game chat input`);
    }
    if (report.handView && overlaps(box, report.handView)) {
      out.push(`${name(item)}: covers the hand`);
    }
    for (const control of report.trayControls) {
      if (overlaps(box, control)) {
        out.push(`${name(item)}: covers the tray control "${control.label}"`);
      }
    }
  }
  items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
    const boxA = shown(a);
    const boxB = shown(b);
    if (boxA && boxB && !(boxA.right <= boxB.left + 1.5 || boxB.right <= boxA.left + 1.5)) {
      out.push(`${name(a)} and ${name(b)} are stacked, not side by side`);
    }
  }));
  if (report.region) {
    if (Math.abs(report.region.right - anchor) > 1.5) {
      const beside = report.sidebar ? 'game sidebar' : 'viewport edge';
      out.push(`dock right edge ${Math.round(report.region.right)} is not at ${Math.round(anchor)} (beside the ${beside})`);
    }
  }
  if (report.chipStrip && report.chipStrip.right - report.chipStrip.left < CHIP_MIN_PX - 1) {
    out.push(`the minimised chips are squeezed to ${Math.round(report.chipStrip.right - report.chipStrip.left)}px`);
  }
  for (const card of report.handCards) {
    if (!card.reachable) {
      out.push(`hand card "${card.label}" can't be reached in the hand`);
    }
  }
  return out;
}
