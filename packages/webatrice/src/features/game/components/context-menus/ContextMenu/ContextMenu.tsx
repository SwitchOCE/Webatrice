import { useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { ActionId, MenuShortcut } from '@app/feature-widgets/shortcuts';
import { Menu, type MenuAnchor } from '@app/components';

import ContextMenuEntries from './ContextMenuEntries';

/**
 * The game's one menu model: every card, pile, hand, battlefield and player
 * menu is built as these items and drawn on the shared `Menu` by
 * `ContextMenuEntries`.
 *
 * A divider is a separator, an item with a `submenu` opens it (→, Enter or a
 * pointer rest), and an item with neither `onClick` nor `submenu` is shown
 * disabled (a placeholder for something not wired up).
 */
export type ContextMenuItem =
  | {
      label: string;
      /** Runs the item; choosing any item closes the whole menu. */
      onClick?: () => void;
      disabled?: boolean;
      /** The bound shortcut as the user reads it, shown right-aligned (desktop's "Show keyboard
       *  shortcuts in right-click menus"). Spread from `menuShortcut(actionId)` with `keyShortcuts`. */
      shortcut?: string;
      /** Every binding of that shortcut for assistive technology (`aria-keyshortcuts`). */
      keyShortcuts?: string;
      submenu?: ContextMenuItem[];
      /** A toggle (`menuitemcheckbox`), checked or not, like Qt's `QAction::setCheckable(true)`. */
      checked?: boolean;
      /** A colour swatch before the label: the card-counter colour of a counter item. */
      swatch?: string;
    }
  | { divider: true };

/** `menuShortcut(actionId)`: an item's shortcut props from the action's current bindings (useMenuShortcut). */
export type MenuShortcutFor = (actionId: ActionId) => MenuShortcut;

/** A game context menu opened at `anchor`. */
export function ContextMenuPopup({
  items,
  anchor,
  label,
  onClose,
  triggerRef,
}: {
  items: readonly ContextMenuItem[];
  anchor: MenuAnchor;
  /** The menu's accessible name: the card, the zone or the player it is for. */
  label: string;
  onClose: () => void;
  /** Where focus goes back on close; the focused element by default. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <Menu anchor={anchor} label={label} onClose={onClose} triggerRef={triggerRef} className="min-w-[240px] max-w-[min(420px,100vw)]">
      <ContextMenuEntries items={items} />
    </Menu>
  );
}

/** Where a `contextmenu` event opens a menu: at the pointer, or under the element for a keyboard-raised one. */
export function contextMenuAnchor(event: MouseEvent<HTMLElement>): MenuAnchor {
  return event.clientX === 0 && event.clientY === 0
    ? { rect: event.currentTarget.getBoundingClientRect(), placement: 'below' }
    : { x: event.clientX, y: event.clientY };
}

/**
 * A region that opens a context menu on right-click (desktop's
 * `contextMenuEvent`), at the pointer. The region itself takes no focus: its
 * keyboard opener is a control of its own (a pile, the player menu button).
 */
export default function ContextMenu({
  items,
  label,
  children,
  wrapperClassName,
  wrapperStyle,
}: {
  items: readonly ContextMenuItem[];
  label: string;
  children: ReactNode;
  /** The wrapper's layout, kept for the region it wraps. */
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
}) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  return (
    <>
      <div
        className={wrapperClassName}
        style={wrapperStyle}
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchor(contextMenuAnchor(event));
        }}
      >
        {children}
      </div>
      {anchor && <ContextMenuPopup items={items} anchor={anchor} label={label} onClose={() => setAnchor(null)} />}
    </>
  );
}
