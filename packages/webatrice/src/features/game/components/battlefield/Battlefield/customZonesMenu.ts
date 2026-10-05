import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';

/**
 * The "Custom Zones" submenu, one "View custom zone '<name>'" item per zone
 * (desktop CustomZoneMenu, custom_zone_menu.cpp), or nothing when the player
 * has none: desktop hides the menu while it is empty.
 */
export function buildCustomZonesMenu(
  t: TFunction,
  zones: readonly { name: string }[],
  onView: (zoneName: string) => void,
): ContextMenuItem[] {
  if (zones.length === 0) {
    return [];
  }
  return [{
    label: t('PlayerMenu.customZones'),
    submenu: zones.map((zone) => ({
      label: t('PlayerMenu.viewCustomZone', { name: zone.name }),
      onClick: () => onView(zone.name),
    })),
  }];
}
import type { TFunction } from 'i18next';
