import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { buildSayMenu, SAY_MACRO_ACTIONS } from './sayMenu';

type Item = Extract<ContextMenuItem, { label: string }>;

const hints = Object.fromEntries(SAY_MACRO_ACTIONS.map((id) => [id, `<${id}>`])) as Parameters<typeof buildSayMenu>[1];

describe('buildSayMenu', () => {
  it('is disabled without macros', () => {
    expect(buildSayMenu([], hints, vi.fn())).toMatchObject({ label: 'Say', disabled: true, submenu: [] });
  });

  it('lists the macros in order with their shortcut, and sends one verbatim', () => {
    const onSay = vi.fn();
    const macros = Array.from({ length: 11 }, (_, i) => `gg ${i + 1}`);
    const menu = buildSayMenu(macros, hints, onSay) as Item;
    const rows = menu.submenu!.map((i) => [(i as Item).label, (i as Item).shortcut]);
    expect(rows.slice(0, 2)).toEqual([['gg 1', '<game.sayMacro1>'], ['gg 2', '<game.sayMacro2>']]);
    expect(rows.slice(-2)).toEqual([['gg 10', '<game.sayMacro10>'], ['gg 11', undefined]]);
    expect(menu.disabled).toBe(false);

    (menu.submenu![1] as Item).onClick!();
    expect(onSay).toHaveBeenCalledWith('gg 2');
  });
});
