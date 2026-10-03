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

/** Where a menu opens, in viewport pixels. */
export interface MenuAnchor {
  x: number;
  y: number;
  /** `end`: `x` is the menu's right edge (a menu dropping from a right-aligned button). */
  align?: 'start' | 'end';
}

export interface MenuProps {
  anchor: MenuAnchor;
  /** Accessible name of the menu. */
  label: string;
  onClose: () => void;
  /** The control that opened the menu: focus goes back to it on close, and pressing it is not an
   *  outside click (so a toggle button can close its own menu). Defaults to the focused element. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Width and other panel classes. */
  className?: string;
  children: ReactNode;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const EDGE = 8;

export const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary '
  + 'hover:text-text-primary hover:bg-bg-elevated focus:text-text-primary focus:bg-bg-elevated '
  + 'focus:outline-none transition-colors '
  + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

interface MenuLevel {
  /** The submenu of this menu that is open, by id. */
  openSubmenu: string | null;
  setOpenSubmenu: (id: string | null) => void;
}

const MenuLevelContext = createContext<MenuLevel | null>(null);

/** The items of `menu` itself, not those of a submenu portalled out of it, that can take focus. */
function menuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .filter((item) => item.closest('[role="menu"]') === menu && !item.matches(':disabled'));
}

/**
 * Popup menu with the keyboard model of a desktop QMenu (WAI-ARIA menu pattern): opening moves
 * focus to the first item, ↑/↓/Home/End move between items and wrap, a letter jumps to the next
 * item starting with it, → and Enter open a submenu and ← closes it, Escape closes one level, Tab
 * closes the whole menu, and closing returns focus to the control that opened it. Outside presses
 * close it too.
 *
 * Items are found in the DOM, so entries rendered by an extension slot take part as long as they
 * carry a `menuitem` role. Portalled to `document.body` so scrolling ancestors never clip it.
 */
export function Menu({ anchor, label, onClose, triggerRef, className, children }: MenuProps) {
  const parent = useContext(MenuLevelContext);
  const ref = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number }>(
    { left: anchor.x, top: anchor.y, maxHeight: window.innerHeight - EDGE * 2 },
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Clamp inside the viewport once the menu's size is known: a menu opened near the right or
  // bottom edge flips or slides back on-screen, and a tall one scrolls instead of spilling.
  useLayoutEffect(() => {
    const { width, height } = ref.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const preferred = anchor.align === 'end' ? anchor.x - width : anchor.x;
    const left = Math.max(EDGE, Math.min(preferred, window.innerWidth - width - EDGE));
    const top = Math.max(EDGE, Math.min(anchor.y, window.innerHeight - height - EDGE));
    setPosition({ left, top, maxHeight: window.innerHeight - top - EDGE });
  }, [anchor.x, anchor.y, anchor.align]);

  // Focus in on open, back out on close.
  useEffect(() => {
    const menu = ref.current;
    const opener = triggerRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    (menu && menuItems(menu)[0])?.focus();
    return () => {
      const active = document.activeElement;
      if (opener?.isConnected && (active == null || active === document.body || menu?.contains(active))) {
        opener.focus();
      }
    };
    // Mount/unmount only: re-anchoring an open menu must not pull focus back to its first item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const letter = event.key.toLocaleLowerCase();
        const next = [...items.slice(index + 1), ...items.slice(0, index + 1)]
          .find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(letter));
        next?.focus();
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // Pointing at an item closes a sibling submenu, as hovering does in a QMenu.
  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const item = (event.target as Element).closest<HTMLElement>(ITEM_SELECTOR);
    if (item && item.closest('[role="menu"]') === ref.current) {
      setOpenSubmenu(item.dataset.submenu ?? null);
    }
  };

  return createPortal(
    <MenuLevelContext.Provider value={{ openSubmenu, setOpenSubmenu }}>
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={position}
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

export interface MenuItemProps {
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  /** Shortcut hint drawn on the right, also exposed as `aria-keyshortcuts`. */
  shortcut?: string;
  title?: string;
  children: ReactNode;
}

/** A menu entry. Choosing it runs `onSelect`; closing the menu afterwards is the caller's call. */
export function MenuItem({ onSelect, disabled, icon, shortcut, title, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      title={title}
      aria-keyshortcuts={shortcut}
      onClick={onSelect}
      className={MENU_ITEM_CLASS}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-text-muted" aria-hidden>{shortcut}</span>}
    </button>
  );
}

export interface MenuCheckboxItemProps extends Omit<MenuItemProps, 'onSelect' | 'shortcut'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A checkable entry (`menuitemcheckbox`); toggling it leaves the menu open. */
export function MenuCheckboxItem({ checked, onChange, disabled, icon, title, children }: MenuCheckboxItemProps) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={MENU_ITEM_CLASS}
    >
      {icon}
      <span className="flex-1">{children}</span>
      <span className="w-3 text-xs text-accent" aria-hidden>{checked ? '✓' : ''}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border-subtle" />;
}

export interface MenuSubmenuProps {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Width and other classes of the submenu panel. */
  className?: string;
  children: ReactNode;
}

/** An entry that opens a nested menu to its side: on → , Enter, Space, a click or hover. */
export function MenuSubmenu({ label, icon, disabled, className, children }: MenuSubmenuProps) {
  const level = useContext(MenuLevelContext);
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const open = level?.openSubmenu === id && anchor != null;

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || disabled) {
      return;
    }
    // Open to the right; Menu's clamp slides it back if that runs off-screen.
    setAnchor({ x: rect.right, y: rect.top - 4 });
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
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        data-submenu={id}
        onClick={show}
        onMouseEnter={show}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            show();
          }
        }}
        className={MENU_ITEM_CLASS}
      >
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight size={14} aria-hidden />
      </button>
      {open && (
        <Menu anchor={anchor} label={label} onClose={hide} triggerRef={ref} className={className}>
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
  return (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu';
}

/**
 * Opener for a context menu on a focusable element: a right-click opens it at the pointer, and
 * Shift+F10 or the Menu key open it below the element, so everything a right-click offers is
 * reachable from the keyboard.
 */
export function useContextMenu(): ContextMenuTrigger {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openBelow = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom + 2 });
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
