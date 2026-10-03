import type { TallyType } from '../../../utils/tally';
import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';

/**
 * The "Tally" submenu: exclusive checkable None, a separator, then Subtypes,
 * Total Power and Total Toughness (desktop TallyMenu, tally_menu.cpp). It
 * sets a local preference; nothing is sent.
 */
export function buildTallyMenu(current: TallyType, onSet: (type: TallyType) => void): ContextMenuItem {
  const option = (type: TallyType, label: string): ContextMenuItem => ({
    label,
    checked: current === type,
    onClick: () => onSet(type),
  });
  return {
    label: 'Tally',
    submenu: [
      option('none', 'None'),
      { divider: true },
      option('subtypes', 'Subtypes'),
      option('power', 'Total Power'),
      option('toughness', 'Total Toughness'),
    ],
  };
}
