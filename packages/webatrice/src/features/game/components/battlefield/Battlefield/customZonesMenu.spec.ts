import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { buildCustomZonesMenu } from './customZonesMenu';

type Item = Extract<ContextMenuItem, { label: string }>;

describe('buildCustomZonesMenu', () => {
  it('is hidden while the player has no custom zone', () => {
    expect(buildCustomZonesMenu([], vi.fn())).toEqual([]);
  });

  it('views each zone by name', () => {
    const onView = vi.fn();
    const [menu] = buildCustomZonesMenu([{ name: 'command' }, { name: 'vault' }], onView) as Item[];
    expect(menu.label).toBe('Custom Zones');
    expect(menu.submenu!.map((i) => (i as Item).label))
      .toEqual(['View custom zone \'command\'', 'View custom zone \'vault\'']);
    (menu.submenu![1] as Item).onClick!();
    expect(onView).toHaveBeenCalledWith('vault');
  });
});
