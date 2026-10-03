import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';

/**
 * The "Custom Zones" submenu, one "View custom zone '<name>'" item per zone
 * (desktop CustomZoneMenu, custom_zone_menu.cpp), or nothing when the player
 * has none: desktop hides the menu while it is empty.
 */
export function buildCustomZonesMenu(
  zones: readonly { name: string }[],
  onView: (zoneName: string) => void,
): ContextMenuItem[] {
  if (zones.length === 0) {
    return [];
  }
  return [{
    label: 'Custom Zones',
    submenu: zones.map((zone) => ({ label: `View custom zone '${zone.name}'`, onClick: () => onView(zone.name) })),
  }];
}
