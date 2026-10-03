import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

/** A viewport rectangle, as `getBoundingClientRect` returns it. */
export interface MenuRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a menu opens: a point in viewport pixels (a pointer press), or beside a control. */
export type MenuAnchor =
  | {
    x: number;
    y: number;
    /** `end`: `x` is the menu's right edge (a menu dropping from a right-aligned button). */
    align?: 'start' | 'end';
  }
  | {
    /** The control the menu belongs to. */
    rect: MenuRect;
    /** `below` drops under it (flipping above when there is no room), `right` opens to its side
     *  (flipping to its left), as a submenu does. */
    placement: 'below' | 'right';
    /** `end`: line the menu's right edge up with the control's (`below` only). */
    align?: 'start' | 'end';
  };

export interface MenuProps {
  anchor: MenuAnchor;
  /** Accessible name of the menu. */
  label: string;
  onClose: () => void;
  /** The control that opened the menu: focus goes back to it on close, and pressing it is not an
   *  outside click (so a toggle button can close its own menu). Defaults to the focused element. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Move focus to the first item on open. A submenu opened by hovering leaves focus where it is. */
  autoFocus?: boolean;
  id?: string;
  /** Width and other panel classes. */
  className?: string;
  children: ReactNode;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const EDGE = 8;
/** How long the pointer rests on a submenu entry before the submenu opens. */
export const SUBMENU_OPEN_DELAY = 200;
/** How long a submenu stays open after the pointer moves to a sibling, so a diagonal path into it
 *  can cross other entries. */
export const SUBMENU_CLOSE_DELAY = 300;
/** Typed letters within this many milliseconds of each other are one type-ahead search. */
export const TYPEAHEAD_TIMEOUT = 500;

export const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary '
  + 'hover:text-text-primary hover:bg-bg-elevated focus:text-text-primary focus:bg-bg-elevated '
  + 'focus:outline-none transition-colors '
  + 'aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent';

interface MenuLevel {
  /** The submenu of this menu that is open, by id. */
  openSubmenu: string | null;
  setOpenSubmenu: (id: string | null) => void;
  /** Closes the whole menu, every level. */
  closeAll: () => void;
}

const MenuLevelContext = createContext<MenuLevel | null>(null);

/** The items of `menu` itself, not those of a submenu portalled out of it, that can take focus.
 *  `aria-disabled` items stay reachable, so users learn the action exists and why it is off. */
function menuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .filter((item) => item.closest('[role="menu"]') === menu && !item.matches(':disabled'));
}

/**
 * Where a `width` × `height` menu goes for `anchor` in a `viewport`: a rect anchor first flips to
 * the side that has room, then every anchor is clamped inside the viewport (a point anchor only
 * slides). A menu taller than the room left scrolls (`maxHeight`).
 */
export function placeMenu(
  anchor: MenuAnchor,
  { width, height }: { width: number; height: number },
  viewport: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight },
): { left: number; top: number; maxHeight: number } {
  let left: number;
  let top: number;
  if ('rect' in anchor) {
    const { rect, placement } = anchor;
    const fitsRight = (x: number) => x + width <= viewport.width - EDGE;
    const fitsBelow = (y: number) => y + height <= viewport.height - EDGE;
    if (placement === 'right') {
      // Line the first item up with the entry: the panel has 4px of padding.
      left = fitsRight(rect.right) || rect.left - width < EDGE ? rect.right : rect.left - width;
      top = fitsBelow(rect.top - 4) || rect.bottom + 4 - height < EDGE ? rect.top - 4 : rect.bottom + 4 - height;
    } else {
      left = anchor.align === 'end' ? rect.right - width : rect.left;
      top = fitsBelow(rect.bottom + 2) || rect.top - 2 - height < EDGE ? rect.bottom + 2 : rect.top - 2 - height;
    }
  } else {
    left = anchor.align === 'end' ? anchor.x - width : anchor.x;
    top = anchor.y;
  }
  left = Math.max(EDGE, Math.min(left, viewport.width - width - EDGE));
  top = Math.max(EDGE, Math.min(top, viewport.height - height - EDGE));
  return { left, top, maxHeight: viewport.height - top - EDGE };
}

function anchorKey(anchor: MenuAnchor): string {
  return 'rect' in anchor
    ? `${anchor.placement}:${anchor.align}:${anchor.rect.left},${anchor.rect.top},${anchor.rect.right},${anchor.rect.bottom}`
    : `${anchor.align}:${anchor.x},${anchor.y}`;
}

/**
 * Popup menu with the keyboard model of a desktop QMenu (WAI-ARIA menu pattern): opening moves
 * focus to the first item, ↑/↓/Home/End move between items and wrap, typing jumps to the next
 * item starting with the typed text, → and Enter open a submenu and ← closes it, Escape closes one
 * level, Tab closes the whole menu, and closing returns focus to the control that opened it.
 * Outside presses close it too. The pointer moves focus with it; resting on a submenu entry opens
 * the submenu without taking focus, and it stays open briefly while the pointer crosses siblings.
 *
 * Items are found in the DOM, so entries rendered by an extension slot take part as long as they
 * carry a `menuitem` role. Portalled to `document.body` so scrolling ancestors never clip it.
 */
export function Menu({ anchor, label, onClose, triggerRef, autoFocus = true, id, className, children }: MenuProps) {
  const parent = useContext(MenuLevelContext);
  const ref = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const placement = anchorKey(anchor);
  // Placed for one anchor at a time: while `position` is null the panel renders at 0,0 without a
  // height cap, so the layout effect below measures its natural size (a capped panel would always
  // "fit" below the anchor). Both renders happen before the browser paints.
  const [placed, setPlaced] = useState<{ for: string; position: ReturnType<typeof placeMenu> } | null>(null);
  const position = placed?.for === placement ? placed.position : null;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const typed = useRef({ text: '', at: 0 });
  const closeTimer = useRef<number | undefined>(undefined);

  // Place it once its natural size is known: it flips to the side of the anchor with room, and is
  // then slid back on-screen; a menu taller than the screen scrolls instead of spilling.
  useLayoutEffect(() => {
    if (position) {
      return;
    }
    const { width, height } = ref.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    setPlaced({ for: placement, position: placeMenu(anchor, { width, height }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-placed when the anchor's numbers change
  }, [placement, position]);

  // Focus in on open, back out on close. A layout effect, so focus is back on the opener before
  // a dialog opened by the chosen item (in the same commit) focuses its own field and records
  // where focus came from.
  useLayoutEffect(() => {
    const menu = ref.current;
    const opener = triggerRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return () => {
      const active = document.activeElement;
      // Focus is ours to hand back while it is on <body>, in this menu or in a submenu of it.
      const ours = active == null || active === document.body || menu?.contains(active)
        || active.closest('[role="menu"]') != null;
      if (opener?.isConnected && ours) {
        opener.focus();
      }
    };
    // Mount/unmount only: re-anchoring an open menu must not pull focus back to its first item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (autoFocus && menu && !menu.contains(document.activeElement)) {
      menuItems(menu)[0]?.focus();
    }
  }, [autoFocus]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Outside presses close the root menu (a submenu closes with it). Attached a frame late so the
  // press that opened the menu doesn't close it straight away.
  useEffect(() => {
    if (parent) {
      return;
    }
    const onPress = (event: globalThis.MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[role="menu"]') || triggerRef?.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };
    const frame = requestAnimationFrame(() => document.addEventListener('mousedown', onPress));
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPress);
    };
  }, [parent, triggerRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menu = ref.current;
    // Leaving the menu closes every level: Tab from a submenu bubbles up to the root menu through
    // the React tree, and focus goes back to the opener.
    if (event.key === 'Tab') {
      if (!parent) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    // Other keys from a submenu bubble here too; that level handles its own.
    if (!menu || (event.target as Element).closest('[role="menu"]') !== menu) {
      return;
    }
    const items = menuItems(menu);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(-1);
        break;
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        // Only a submenu closes on ←, handing focus back to its entry in the parent menu.
        if (!parent) {
          return;
        }
        onClose();
        break;
      default: {
        if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey || event.key === ' ') {
          return;
        }
        // Type-ahead: letters typed in quick succession build one prefix ("mo" → "Move to"). A
        // repeated single letter keeps cycling through the items starting with it.
        const key = event.key.toLocaleLowerCase();
        const now = Date.now();
        const text = now - typed.current.at > TYPEAHEAD_TIMEOUT ? key : typed.current.text + key;
        typed.current = { text, at: now };
        const cycling = [...text].every((letter) => letter === key);
        const prefix = cycling ? key : text;
        // A new search starts after the focused item; a growing prefix may still match it.
        const start = cycling ? index + 1 : Math.max(index, 0);
        const next = [...items.slice(start), ...items.slice(0, start)]
          .find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(prefix));
        next?.focus();
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // The pointer moves focus with it, so one row is highlighted, and pointing at another entry
  // closes an open submenu after a short delay (QMenu's behaviour); pointing back at the open
  // submenu's entry, or into the submenu, keeps it open.
  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const menu = ref.current;
    const target = event.target as Element;
    const item = target.closest<HTMLElement>(ITEM_SELECTOR);
    // Events from a submenu reach this level through the React tree: the pointer is inside it.
    if (!menu || !menu.contains(target)) {
      window.clearTimeout(closeTimer.current);
      return;
    }
    if (!item || item.closest('[role="menu"]') !== menu) {
      return;
    }
    if (document.activeElement !== item) {
      item.focus({ preventScroll: true });
    }
    window.clearTimeout(closeTimer.current);
    if (openSubmenu != null && item.dataset.submenu !== openSubmenu) {
      closeTimer.current = window.setTimeout(() => setOpenSubmenu(null), SUBMENU_CLOSE_DELAY);
    }
  };

  const level: MenuLevel = {
    openSubmenu,
    setOpenSubmenu: (submenu) => {
      window.clearTimeout(closeTimer.current);
      setOpenSubmenu(submenu);
    },
    closeAll: parent?.closeAll ?? onClose,
  };

  return createPortal(
    <MenuLevelContext.Provider value={level}>
      <div
        ref={ref}
        id={id}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={position ?? { left: 0, top: 0 }}
        onKeyDown={onKeyDown}
        onMouseOver={onMouseOver}
        onContextMenu={(event) => event.preventDefault()}
        className={[
          'fixed z-[9999] overflow-y-auto rounded-md bg-bg-surface border border-border-subtle shadow-glow py-1',
          'select-none focus:outline-none',
          className ?? 'w-[200px]',
        ].join(' ')}
      >
        {children}
      </div>
    </MenuLevelContext.Provider>,
    document.body,
  );
}

interface MenuEntryProps {
  disabled?: boolean;
  /** Why a disabled entry is off. Read out with it (`aria-describedby`) and shown on hover. */
  disabledReason?: string;
  icon?: ReactNode;
  /** Shortcut hint drawn on the right, as the user reads it (e.g. "Ctrl+Shift+A"). */
  shortcut?: string;
  /** The same shortcut for assistive technology, in `aria-keyshortcuts` syntax (e.g.
   *  "Control+Shift+A"; alternatives separated by spaces). */
  keyShortcuts?: string;
  title?: string;
  /** Close the whole menu after this entry is chosen. */
  closeOnSelect?: boolean;
  children: ReactNode;
}

interface MenuEntryButtonProps extends Omit<MenuEntryProps, 'closeOnSelect'> {
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';
  checked?: boolean;
  onActivate: () => void;
  closeOnSelect: boolean;
  /** Drawn after the shortcut (a check mark or radio dot). */
  indicator?: ReactNode;
}

function MenuEntryButton({
  role,
  checked,
  onActivate,
  disabled,
  disabledReason,
  icon,
  shortcut,
  keyShortcuts,
  title,
  closeOnSelect,
  indicator,
  children,
}: MenuEntryButtonProps) {
  const level = useContext(MenuLevelContext);
  const reasonId = useId();
  const reason = disabled ? disabledReason : undefined;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-describedby={reason ? reasonId : undefined}
      title={reason ?? title}
      aria-keyshortcuts={keyShortcuts}
      onClick={() => {
        if (disabled) {
          return;
        }
        onActivate();
        if (closeOnSelect) {
          level?.closeAll();
        }
      }}
      className={MENU_ITEM_CLASS}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-text-muted" aria-hidden>{shortcut}</span>}
      {indicator}
      {reason && <span id={reasonId} hidden>{reason}</span>}
    </button>
  );
}

export interface MenuItemProps extends MenuEntryProps {
  onSelect: () => void;
}

/** A menu entry. Choosing it runs `onSelect` and closes the menu, unless `closeOnSelect` is false. */
export function MenuItem({ onSelect, closeOnSelect = true, ...props }: MenuItemProps) {
  return <MenuEntryButton role="menuitem" onActivate={onSelect} closeOnSelect={closeOnSelect} {...props} />;
}

export interface MenuCheckboxItemProps extends MenuEntryProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A checkable entry (`menuitemcheckbox`); toggling it leaves the menu open unless `closeOnSelect`. */
export function MenuCheckboxItem({ checked, onChange, closeOnSelect = false, ...props }: MenuCheckboxItemProps) {
  return (
    <MenuEntryButton
      role="menuitemcheckbox"
      checked={checked}
      onActivate={() => onChange(!checked)}
      closeOnSelect={closeOnSelect}
      indicator={<span className="w-3 text-xs text-accent" aria-hidden>{checked ? '✓' : ''}</span>}
      {...props}
    />
  );
}

export interface MenuRadioItemProps extends MenuEntryProps {
  /** This entry is the group's current choice. */
  checked: boolean;
  onSelect: () => void;
}

/**
 * One choice of an exclusive group (`menuitemradio`), like a QAction in a QActionGroup. Wrap the
 * group in `MenuGroup`, or separate it with `MenuSeparator`s. Choosing it leaves the menu open
 * unless `closeOnSelect`.
 */
export function MenuRadioItem({ checked, onSelect, closeOnSelect = false, ...props }: MenuRadioItemProps) {
  return (
    <MenuEntryButton
      role="menuitemradio"
      checked={checked}
      onActivate={onSelect}
      closeOnSelect={closeOnSelect}
      indicator={<span className="w-3 text-xs text-accent" aria-hidden>{checked ? '●' : ''}</span>}
      {...props}
    />
  );
}

/** A labelled group of entries (`role="group"`), e.g. the radio items of one choice. */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label}>{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border-subtle" />;
}

export interface MenuSubmenuProps {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Why the submenu is off; see `MenuItem`'s `disabledReason`. */
  disabledReason?: string;
  /** Width and other classes of the submenu panel. */
  className?: string;
  children: ReactNode;
}

/**
 * An entry that opens a nested menu to its side (to its left when the right has no room). → ,
 * Enter, Space or a click open it and move focus in; resting the pointer on it opens it after
 * `SUBMENU_OPEN_DELAY` and leaves focus where it is, so → still moves in.
 */
export function MenuSubmenu({ label, icon, disabled, disabledReason, className, children }: MenuSubmenuProps) {
  const level = useContext(MenuLevelContext);
  const id = useId();
  const menuId = `${id}menu`;
  const reasonId = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [focusIn, setFocusIn] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const open = level?.openSubmenu === id && anchor != null;
  const reason = disabled ? disabledReason : undefined;

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const show = (moveFocus: boolean) => {
    window.clearTimeout(openTimer.current);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || disabled) {
      return;
    }
    if (open) {
      // Already open from a hover: the keyboard still moves into it.
      const submenu = document.getElementById(menuId);
      if (moveFocus && submenu) {
        menuItems(submenu)[0]?.focus();
      }
      return;
    }
    setFocusIn(moveFocus);
    setAnchor({ rect, placement: 'right' });
    level?.setOpenSubmenu(id);
  };
  const hide = () => level?.setOpenSubmenu(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-disabled={disabled || undefined}
        aria-describedby={reason ? reasonId : undefined}
        title={reason}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-submenu={id}
        onClick={() => show(true)}
        onMouseEnter={() => {
          window.clearTimeout(openTimer.current);
          openTimer.current = window.setTimeout(() => show(false), SUBMENU_OPEN_DELAY);
        }}
        onMouseLeave={() => window.clearTimeout(openTimer.current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            show(true);
          }
        }}
        className={MENU_ITEM_CLASS}
      >
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight size={14} aria-hidden />
        {reason && <span id={reasonId} hidden>{reason}</span>}
      </button>
      {open && (
        <Menu
          id={menuId}
          anchor={anchor}
          label={label}
          onClose={hide}
          triggerRef={ref}
          autoFocus={focusIn}
          className={className}
        >
          {children}
        </Menu>
      )}
    </>
  );
}

export interface ContextMenuTrigger {
  /** Where the menu is open, or null while closed. */
  anchor: MenuAnchor | null;
  /** The control that opened it, for `Menu`'s `triggerRef`. */
  triggerRef: RefObject<HTMLElement | null>;
  close: () => void;
  getTriggerProps: () => {
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  };
}

/** True for the keys that open a context menu on every desktop platform: Shift+F10 and the Menu key. */
export function isContextMenuKey(event: KeyboardEvent): boolean {
  if (event.key === 'ContextMenu') {
    return true;
  }
  return event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/**
 * Opener for a context menu on a focusable element: a right-click opens it at the pointer, and
 * Shift+F10 or the Menu key open it below the element (above it near the bottom of the screen),
 * so everything a right-click offers is reachable from the keyboard.
 */
export function useContextMenu(): ContextMenuTrigger {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openBelow = (element: HTMLElement) => {
    setAnchor({ rect: element.getBoundingClientRect(), placement: 'below' });
  };

  const close = useCallback(() => setAnchor(null), []);

  return {
    anchor,
    triggerRef,
    close,
    getTriggerProps: () => ({
      onContextMenu: (event) => {
        event.preventDefault();
        triggerRef.current = event.currentTarget;
        // A keyboard-raised contextmenu event carries no pointer position.
        if (event.clientX === 0 && event.clientY === 0) {
          openBelow(event.currentTarget);
        } else {
          setAnchor({ x: event.clientX + 2, y: event.clientY + 4 });
        }
      },
      onKeyDown: (event) => {
        if (isContextMenuKey(event)) {
          event.preventDefault();
          triggerRef.current = event.currentTarget;
          openBelow(event.currentTarget);
        }
      },
      'aria-haspopup': 'menu',
      'aria-expanded': anchor != null,
    }),
  };
}
