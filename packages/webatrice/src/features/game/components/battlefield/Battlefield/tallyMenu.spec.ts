import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { buildTallyMenu } from './tallyMenu';

type Item = Extract<ContextMenuItem, { label: string }>;

describe('buildTallyMenu', () => {
  it('checks exactly the current tally and sets the picked one', () => {
    const onSet = vi.fn();
    const menu = buildTallyMenu('power', onSet) as Item;
    expect(menu.label).toBe('Tally');
    expect(menu.submenu!.map((i) => ('divider' in i ? '---' : `${i.checked ? '✓ ' : ''}${i.label}`)))
      .toEqual(['None', '---', 'Subtypes', '✓ Total Power', 'Total Toughness']);

    (menu.submenu![2] as Item).onClick!();
    expect(onSet).toHaveBeenCalledWith('subtypes');
  });
});
