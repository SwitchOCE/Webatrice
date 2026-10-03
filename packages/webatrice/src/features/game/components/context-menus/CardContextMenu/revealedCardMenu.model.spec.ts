import type { ActionId } from '@app/feature-widgets/shortcuts';

import type { CardMenuItem } from './cardContextMenu.model';
import { buildRevealedCardMenu } from './revealedCardMenu.model';

const hints = new Proxy({}, { get: (_target, key) => `<${String(key)}>` }) as Record<ActionId, string>;

function rows(items: CardMenuItem[]): string[] {
  return items.map((item) => ('divider' in item ? '---' : [item.label, item.shortcut ? `[${item.shortcut}]` : ''].join(' ').trim()));
}

describe('buildRevealedCardMenu', () => {
  it('builds desktop\'s revealed-card menu', () => {
    const menu = buildRevealedCardMenu({
      shortcutHints: hints,
      onHide: vi.fn(),
      onClone: vi.fn(),
      onSelectAll: vi.fn(),
      relatedViewItems: [{ divider: true }, { label: 'View related cards', submenu: [] }],
    });
    expect(rows(menu)).toEqual([
      'Hide [<game.hideRevealedCard>]',
      '---',
      'Clone [<game.cloneCard>]',
      '---',
      'Select All [<game.selectAllBattlefield>]',
      '---',
      'View related cards',
    ]);
  });

  it('wires Hide, Clone and Select All', () => {
    const args = { shortcutHints: hints, onHide: vi.fn(), onClone: vi.fn(), onSelectAll: vi.fn() };
    const menu = buildRevealedCardMenu(args);
    for (const item of menu) {
      if (!('divider' in item)) {
        item.onClick?.();
      }
    }
    expect(args.onHide).toHaveBeenCalledTimes(1);
    expect(args.onClone).toHaveBeenCalledTimes(1);
    expect(args.onSelectAll).toHaveBeenCalledTimes(1);
  });
});
