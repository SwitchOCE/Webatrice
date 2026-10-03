import type { LookupResult, RelatedCardRef } from '@app/services';

import type { CardMenuItem } from './cardContextMenu.model';
import { buildRelatedTokenItems, buildRelatedViewItems, buildTransformItems } from './relatedCardActions';

const lookup = (name: string, overrides: Partial<LookupResult> = {}): LookupResult => ({
  found: true,
  source: 'dexie',
  name,
  printings: [],
  ...overrides,
});
const ref = (name: string, overrides: Partial<RelatedCardRef> = {}): RelatedCardRef => ({ name, origin: 'related', ...overrides });
const row = (item: CardMenuItem) => {
  if ('divider' in item) {
    throw new Error('unexpected divider');
  }
  return item;
};

describe('buildRelatedTokenItems', () => {
  const tokenMeta = new Map([
    ['Soldier', lookup('Soldier', { power: '1', toughness: '1', colors: ['W'], printings: [{ scryfallId: 'sol-1' } as never] })],
    ['Treasure', lookup('Treasure', { colors: [] })],
    ['Spirit', lookup('Spirit', { power: '1', toughness: '1', colors: ['W', 'B'] })],
  ]);

  it('labels counts and P/T like desktop addRelatedCardActions', () => {
    const items = buildRelatedTokenItems(
      [
        ref('Soldier'),
        ref('Soldier', { count: '1' }),
        ref('Soldier', { count: '3' }),
        ref('Treasure', { count: 'x' }),
        ref('Unknown Token'),
      ],
      tokenMeta,
      vi.fn(),
    );
    expect(items.map((i) => row(i).label)).toEqual([
      'Token: 1/1 Soldier',
      'Token: 1/1 Soldier',
      'Token: 3x 1/1 Soldier',
      'Token: X Treasure',
      'Token: Unknown Token',
    ]);
  });

  it('creates N tokens for a numeric count and one for X, with color and printing', () => {
    const create = vi.fn();
    const [three, x, multi, persistent] = buildRelatedTokenItems(
      [ref('Soldier', { count: '3' }), ref('Treasure', { count: 'x' }), ref('Spirit'), ref('Soldier', { persistent: 'persistent' })],
      tokenMeta,
      create,
    ).map(row);

    three.onClick!();
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenLastCalledWith({
      name: 'Soldier',
      color: 'w',
      pt: '1/1',
      annotation: '',
      destroyOnZoneChange: true,
      faceDown: false,
      providerId: 'sol-1',
    });

    create.mockClear();
    x.onClick!();
    multi.onClick!();
    persistent.onClick!();
    expect(create.mock.calls.map(([r]) => [r.name, r.color, r.pt, r.destroyOnZoneChange])).toEqual([
      ['Treasure', '', '', true],
      ['Spirit', 'm', '1/1', true],
      ['Soldier', 'w', '1/1', false],
    ]);
  });

  it('still renders items when no create-token command is available', () => {
    const [item] = buildRelatedTokenItems([ref('Soldier')], tokenMeta, undefined).map(row);
    expect(() => item.onClick!()).not.toThrow();
  });
});

describe('annotating tokens with their card text', () => {
  it('gives a related token its rules text with "Annotate card text on tokens" on, and nothing off', () => {
    const tokenMeta = new Map([['Treasure', lookup('Treasure', { text: 'Sacrifice this artifact: Add one mana of any color.' })]]);
    const create = vi.fn();
    const [annotated] = buildRelatedTokenItems([ref('Treasure')], tokenMeta, create, true).map(row);
    annotated.onClick!();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      annotation: 'Sacrifice this artifact: Add one mana of any color.',
    }));

    const [plain] = buildRelatedTokenItems([ref('Treasure')], tokenMeta, create).map(row);
    plain.onClick!();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ annotation: '' }));
  });

  it('gives a transformed face its own rules text', () => {
    const faces = [
      { name: 'Delver of Secrets', text: 'At the beginning of your upkeep, look at the top card of your library.' },
      { name: 'Insectile Aberration', text: 'Flying' },
    ];
    const create = vi.fn();
    const [item] = buildTransformItems({ layout: 'transform', faces }, 42, 'Delver of Secrets', create, true).map(row);
    item.onClick!();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Insectile Aberration', annotation: 'Flying' }));
  });
});

describe('buildTransformItems', () => {
  const faces = [
    { name: 'Delver of Secrets', power: '1', toughness: '1', colors: ['U'] },
    { name: 'Insectile Aberration', power: '3', toughness: '2', colors: ['U'] },
  ];

  it('offers the other face of a transformable card and targets the source card', () => {
    const create = vi.fn();
    const [front] = buildTransformItems({ layout: 'transform', faces }, 42, 'Delver of Secrets', create).map(row);
    expect(front).toMatchObject({ label: 'Token: Transform into "Insectile Aberration"', shortcut: 'Ctrl+Shift+T' });
    front.onClick!();
    expect(create).toHaveBeenCalledWith({
      name: 'Insectile Aberration',
      color: 'u',
      pt: '3/2',
      annotation: '',
      destroyOnZoneChange: false,
      faceDown: false,
      targetCardId: 42,
      targetMode: 'transform_into',
    });

    const [back] = buildTransformItems({ layout: 'modal_dfc', faces }, 42, 'Insectile Aberration', vi.fn()).map(row);
    expect(back.label).toBe('Token: Transform into "Delver of Secrets"');
  });

  it.each([
    ['no metadata', undefined, 42],
    ['a non-flipping layout', { layout: 'adventure', faces }, 42],
    ['a single face', { layout: 'transform', faces: faces.slice(0, 1) }, 42],
    ['no server card id', { layout: 'transform', faces }, undefined],
  ])('offers nothing for %s', (_label, meta, cardId) => {
    expect(buildTransformItems(meta, cardId, 'Delver of Secrets', vi.fn())).toEqual([]);
  });

  it('targets card id 0, the first id Servatrice hands out', () => {
    const create = vi.fn();
    const [item] = buildTransformItems({ layout: 'reversible_card', faces }, 0, 'Delver of Secrets', create).map(row);
    item.onClick!();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ targetCardId: 0, targetMode: 'transform_into' }));
  });

  it('offers nothing without a create-token command', () => {
    expect(buildTransformItems({ layout: 'transform', faces }, 42, 'Delver of Secrets', undefined)).toEqual([]);
  });
});

describe('buildRelatedViewItems', () => {
  const known = new Set(['Spark Elemental']);
  const resolvable = (name: string) => known.has(name);

  it('lists every relation, related and reverse-related, in order after a separator', () => {
    const onView = vi.fn();
    const items = buildRelatedViewItems(
      [ref('Missing Card'), ref('Spark Elemental', { origin: 'reverse-related' })],
      resolvable,
      onView,
    );
    expect(items[0]).toEqual({ divider: true });
    const submenu = row(items[1]).submenu ?? [];
    expect(row(items[1]).label).toBe('View related cards');
    expect(submenu.map((i) => row(i).label)).toEqual(['Missing Card', 'Spark Elemental']);

    row(submenu[1]).onClick?.();
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spark Elemental' }));
  });

  it('is empty unless at least one relation resolves', () => {
    expect(buildRelatedViewItems([ref('Missing Card')], resolvable, vi.fn())).toEqual([]);
    expect(buildRelatedViewItems([], resolvable, vi.fn())).toEqual([]);
  });
});
