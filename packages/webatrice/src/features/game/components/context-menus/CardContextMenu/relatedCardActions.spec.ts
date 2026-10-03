import type { LookupResult, RelatedCardRef } from '@app/services';

import type { CardMenuItem } from './cardContextMenu.model';
import { buildRelatedTokenItems, buildTransformItems } from './relatedCardActions';

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
