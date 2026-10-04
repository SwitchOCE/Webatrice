import type { LookupResult, RelatedCardRef } from '@app/services';

import type { CardMenuItem } from './cardContextMenu.model';
import {
  buildRelatedActionItems,
  buildRelatedTokenItems,
  buildRelatedViewItems,
  buildTransformItems,
  createAllRelatedRequests,
  type RelatedCardSource,
} from './relatedCardActions';

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

describe('buildTransformItems', () => {
  const faces = [
    { name: 'Delver of Secrets', power: '1', toughness: '1', colors: ['U'] },
    { name: 'Insectile Aberration', power: '3', toughness: '2', colors: ['U'] },
  ];

  it('offers the other face of a transformable card and targets the source card', () => {
    const create = vi.fn();
    const [front] = buildTransformItems({ layout: 'transform', faces }, 42, 'Delver of Secrets', create).map(row);
    // The create-all hint is placed by buildRelatedActionItems, never hard-coded.
    expect(front).toEqual({ label: 'Token: Transform into "Insectile Aberration"', onClick: expect.any(Function) });
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

describe('create all related tokens', () => {
  const tokenMeta = new Map([['Soldier', lookup('Soldier', { power: '1', toughness: '1' })]]);
  const faces = [
    { name: 'Delver of Secrets', power: '1', toughness: '1' },
    { name: 'Insectile Aberration', power: '3', toughness: '2' },
  ];
  const source = (overrides: Partial<RelatedCardSource>): RelatedCardSource => ({
    related: [],
    tokenMeta,
    parentMeta: undefined,
    sourceCardId: 7,
    parentName: 'Delver of Secrets',
    ...overrides,
  });

  it('runs the only related action, whatever it is', () => {
    expect(createAllRelatedRequests(source({ related: [ref('Treasure', { count: 'x' })] })).map((r) => r.name))
      .toEqual(['Treasure']);
    expect(createAllRelatedRequests(source({ parentMeta: { layout: 'transform', faces } })))
      .toEqual([expect.objectContaining({ name: 'Insectile Aberration', targetCardId: 7, targetMode: 'transform_into' })]);
  });

  it('otherwise creates every token that neither attaches nor asks for a count', () => {
    const requests = createAllRelatedRequests(source({
      related: [ref('Soldier', { count: '2' }), ref('Treasure', { count: 'x' }), ref('Aura', { attach: 'attach' })],
      parentMeta: { layout: 'transform', faces },
    }));
    expect(requests.map((r) => r.name)).toEqual(['Soldier', 'Soldier']);
  });

  it('puts the create-all hint on the only item, or on "All tokens"', () => {
    const single = buildRelatedActionItems(source({ related: [ref('Soldier')] }), vi.fn(), 'Ctrl+Shift+K').map(row);
    expect(single.map((i) => [i.label, i.shortcut])).toEqual([['Token: 1/1 Soldier', 'Ctrl+Shift+K']]);

    const create = vi.fn();
    const many = buildRelatedActionItems(
      source({ related: [ref('Soldier'), ref('Treasure', { count: 'x' })], parentMeta: { layout: 'transform', faces } }),
      create,
      'Ctrl+Shift+K',
    ).map(row);
    expect(many.map((i) => [i.label, i.shortcut])).toEqual([
      ['Token: 1/1 Soldier', undefined],
      ['Token: X Treasure', undefined],
      ['Token: Transform into "Insectile Aberration"', undefined],
      ['All tokens', 'Ctrl+Shift+K'],
    ]);
    many[3].onClick!();
    expect(create.mock.calls.map(([r]) => r.name)).toEqual(['Soldier']);
  });

  it('offers nothing for a card without relations, and no hint when unbound', () => {
    expect(buildRelatedActionItems(source({}), vi.fn(), 'Ctrl+Shift+K')).toEqual([]);
    expect(row(buildRelatedActionItems(source({ related: [ref('Soldier')] }), vi.fn(), '')[0]).shortcut).toBeUndefined();
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
