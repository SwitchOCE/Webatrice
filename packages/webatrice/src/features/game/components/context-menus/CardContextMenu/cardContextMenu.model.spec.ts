import type { ActionId } from '@app/feature-widgets/shortcuts';

import { counterColorForId } from '../../ui/CardSlot/counterColors';
import { buildCardContextMenu, type BuildCardContextMenuArgs, type CardMenuItem } from './cardContextMenu.model';

// Every hint renders as its action id, so the tree pins which binding each row shows.
const hints = new Proxy({}, { get: (_target, key) => `<${String(key)}>` }) as Record<ActionId, string>;

function makeArgs(overrides: Partial<BuildCardContextMenuArgs> = {}): BuildCardContextMenuArgs {
  const handler = () => vi.fn();
  return {
    shortcutHints: hints,
    faceDown: false,
    doesntUntap: false,
    isAttached: false,
    onTapUntap: handler(),
    onFlip: handler(),
    onPeek: handler(),
    onSkipUntapping: handler(),
    onClone: handler(),
    onSetAnnotation: handler(),
    onMoveToTop: handler(),
    onMoveToBottom: handler(),
    onMoveToTable: handler(),
    onMoveToHand: handler(),
    onMoveToGrave: handler(),
    onMoveToExile: handler(),
    onMoveToXCardsFromTop: handler(),
    onIncP: handler(),
    onDecP: handler(),
    onFlowP: handler(),
    onIncT: handler(),
    onDecT: handler(),
    onFlowT: handler(),
    onIncPT: handler(),
    onDecPT: handler(),
    onSetPT: handler(),
    onResetPT: handler(),
    onAttachToCard: handler(),
    onUnattach: handler(),
    onDrawArrow: handler(),
    onReduceLifeByPower: handler(),
    onSelectAll: handler(),
    onSelectRow: handler(),
    onAddCardCounter: handler(),
    onSetCardCounter: handler(),
    ...overrides,
  };
}

/** One line per row: label, [shortcut], ✓ when checked, (swatch); submenus indented. */
function tree(items: CardMenuItem[], depth = 0): string[] {
  return items.flatMap((item) => {
    const pad = '  '.repeat(depth);
    if ('divider' in item) {
      return [`${pad}---`];
    }
    const line = [
      item.label,
      item.shortcut ? `[${item.shortcut}]` : '',
      item.checked ? '✓' : '',
      item.swatch ? `(${item.swatch})` : '',
    ].filter(Boolean).join(' ');
    return [`${pad}${line}`, ...(item.submenu ? tree(item.submenu, depth + 1) : [])];
  });
}

const find = (items: CardMenuItem[], ...path: string[]): Exclude<CardMenuItem, { divider: true }> => {
  let level = items;
  let found: CardMenuItem | undefined;
  for (const label of path) {
    found = level.find((i) => !('divider' in i) && i.label === label);
    if (!found || 'divider' in found) {
      throw new Error(`no menu row ${path.join(' > ')}`);
    }
    level = found.submenu ?? [];
  }
  return found as Exclude<CardMenuItem, { divider: true }>;
};

describe('buildCardContextMenu', () => {
  it('builds the own face-up battlefield card menu', () => {
    expect(tree(buildCardContextMenu(makeArgs()))).toEqual([
      'Tap / Untap',
      'Skip untapping [<game.doesntUntap>]',
      'Turn Over [<game.flipCard>]',
      '---',
      'Clone [<game.cloneCard>]',
      'Move to',
      '  Top of library in random order',
      '  X cards from the top of library...',
      '  Bottom of library in random order [<game.moveSelectedToLibraryBottom>]',
      '  ---',
      '  Table',
      '  Hand',
      '  ---',
      '  Graveyard [<game.moveSelectedToGrave>]',
      '  Exile',
      '---',
      'Attach to card... [<game.attachCard>]',
      'Draw arrow... [<game.drawArrow>]',
      '---',
      'Power / toughness',
      '  Increase power [<game.incP>]',
      '  Decrease power [<game.decP>]',
      '  Increase power and decrease toughness',
      '  ---',
      '  Increase toughness [<game.incT>]',
      '  Decrease toughness [<game.decT>]',
      '  Decrease power and increase toughness',
      '  ---',
      '  Increase power and toughness [<game.incPT>]',
      '  Decrease power and toughness [<game.decPT>]',
      '  ---',
      '  Set power and toughness... [<game.setCardPT>]',
      '  Reset power and toughness [<game.resetPT>]',
      'Set annotation... [<game.setAnnotation>]',
      '---',
      'Reduce life by power [<game.reduceLifeByPower>]',
      '---',
      'Select All [<game.selectAllBattlefield>]',
      'Select Row [<game.selectRowBattlefield>]',
      '---',
      'Card counters',
      ...['A', 'B', 'C', 'D', 'E', 'F'].flatMap((letter, i) => [
        ...(i > 0 ? ['  ---'] : []),
        `  Add counter (${letter})${i < 3 ? ` [<game.addCounter${letter}>]` : ''} (${counterColorForId(i)})`,
        `  Set counters (${letter})...${i < 3 ? ` [<game.setCounter${letter}>]` : ''} (${counterColorForId(i)})`,
      ]),
    ]);
  });

  it('adds peek and the face-up label for a face-down card, unattach for an attached one, and checks skip-untapping', () => {
    const rows = tree(buildCardContextMenu(makeArgs({ faceDown: true, isAttached: true, doesntUntap: true })));
    expect(rows.slice(0, 4)).toEqual([
      'Tap / Untap',
      'Skip untapping [<game.doesntUntap>] ✓',
      'Turn Over (face up) [<game.flipCard>]',
      'Peek card [<game.peekCard>]',
    ]);
    expect(rows).toContain('Unattach [<game.unattachCard>]');
    expect(rows.indexOf('Unattach [<game.unattachCard>]')).toBe(rows.indexOf('Attach to card... [<game.attachCard>]') + 1);
  });

  it('appends related-card items after a divider, and nothing for an empty list', () => {
    const token: CardMenuItem = { label: 'Token: 1/1 Soldier' };
    expect(tree(buildCardContextMenu(makeArgs({ tokenItems: [token] }))).slice(-2)).toEqual(['---', 'Token: 1/1 Soldier']);
    expect(tree(buildCardContextMenu(makeArgs({ tokenItems: [] }))).at(-1)).toMatch(/^ {2}Set counters \(F\)/);
  });

  it('wires each row to its handler, passing the counter slot', () => {
    const args = makeArgs();
    const menu = buildCardContextMenu(args);
    find(menu, 'Move to', 'Graveyard').onClick!();
    find(menu, 'Power / toughness', 'Increase power and decrease toughness').onClick!();
    find(menu, 'Card counters', 'Add counter (C)').onClick!();
    find(menu, 'Card counters', 'Set counters (E)...').onClick!();

    expect(args.onMoveToGrave).toHaveBeenCalledTimes(1);
    expect(args.onFlowP).toHaveBeenCalledTimes(1);
    expect(args.onAddCardCounter).toHaveBeenCalledWith(2);
    expect(args.onSetCardCounter).toHaveBeenCalledWith(4);
  });
});
