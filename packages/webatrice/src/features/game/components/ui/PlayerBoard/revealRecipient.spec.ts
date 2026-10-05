import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { buildRevealToSubmenu, toRecipient } from './revealRecipient';

describe('toRecipient', () => {
  it('maps the "All players" sentinel to the port\'s "all" and keeps a player id', () => {
    expect(toRecipient(-1)).toBe('all');
    expect(toRecipient(2)).toBe(2);
  });
});

describe('buildRevealToSubmenu', () => {
  type Item = Extract<ContextMenuItem, { label: string }>;
  const labels = (items: ContextMenuItem[]) => items.map((i) => ('divider' in i ? '---' : i.label));
  const item = (items: ContextMenuItem[], index: number) => items[index] as Item;

  it('lists "All players", a separator, then each other player', () => {
    const onPick = vi.fn();
    const items = buildRevealToSubmenu([{ playerId: 2, name: 'Bob' }, { playerId: 3, name: 'Cy' }], onPick);

    expect(labels(items)).toEqual(['All players', '---', 'Bob', 'Cy']);
    item(items, 0).onClick!();
    item(items, 3).onClick!();
    expect(onPick.mock.calls).toEqual([[-1], [3]]);
  });

  it('still offers "All players" when playing alone, as desktop does', () => {
    expect(labels(buildRevealToSubmenu([], vi.fn()))).toEqual(['All players', '---']);
    expect(labels(buildRevealToSubmenu(undefined, vi.fn()))).toEqual(['All players', '---']);
  });

  it('disables every entry together and hints the shortcut on "All players"', () => {
    const items = buildRevealToSubmenu([{ playerId: 2, name: 'Bob' }], vi.fn(), true, { shortcut: 'Ctrl+R', keyShortcuts: 'Control+R' });
    expect(items[0]).toMatchObject({ disabled: true, shortcut: 'Ctrl+R' });
    expect(items[2]).toMatchObject({ disabled: true });
  });
});
