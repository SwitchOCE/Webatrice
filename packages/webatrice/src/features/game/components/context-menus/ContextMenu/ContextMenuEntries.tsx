import { MenuCheckboxItem, MenuItem, MenuSeparator, MenuSubmenu } from '@app/components';
import { usePreference } from '@app/hooks';

import type { ContextMenuItem } from './ContextMenu';

/** A counter item's colour, before its label. */
function Swatch({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />;
}

/**
 * The game's menu items (`ContextMenuItem[]`, the model every game menu builder returns) drawn as
 * entries of the shared `Menu`, so a menu built from them takes focus, moves with the arrow keys
 * and type-ahead, opens submenus with → and Enter, and gives focus back on close: a divider is a
 * separator, an item with neither `onClick` nor a submenu is shown disabled, a `checked` item is a
 * check-box entry, and choosing any item closes the menu.
 */
export default function ContextMenuEntries({ items }: { items: readonly ContextMenuItem[] }) {
  // Desktop's "Show keyboard shortcuts in right-click menus".
  const showShortcuts = usePreference('showShortcutsInMenus');
  return (
    <>
      {items.map((item, i) => {
        if ('divider' in item) {
          return <MenuSeparator key={`d-${i}`} />;
        }
        const key = `i-${i}`;
        if (item.submenu && item.submenu.length > 0) {
          return (
            <MenuSubmenu key={key} label={item.label} disabled={item.disabled}>
              <ContextMenuEntries items={item.submenu} />
            </MenuSubmenu>
          );
        }
        const disabled = item.disabled || !item.onClick;
        const shortcut = showShortcuts ? item.shortcut : undefined;
        const icon = item.swatch !== undefined ? <Swatch color={item.swatch} /> : undefined;
        if (item.checked !== undefined) {
          return (
            <MenuCheckboxItem
              key={key}
              checked={item.checked}
              onChange={() => item.onClick?.()}
              closeOnSelect
              disabled={disabled}
              shortcut={shortcut}
              keyShortcuts={item.keyShortcuts}
              icon={icon}
            >
              {item.label}
            </MenuCheckboxItem>
          );
        }
        return (
          <MenuItem
            key={key}
            onSelect={() => item.onClick?.()}
            disabled={disabled}
            shortcut={shortcut}
            keyShortcuts={item.keyShortcuts}
            icon={icon}
          >
            {item.label}
          </MenuItem>
        );
      })}
    </>
  );
}
