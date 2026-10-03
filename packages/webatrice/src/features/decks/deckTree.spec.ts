import { create } from '@bufbuild/protobuf';
import {
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
  type ServerInfo_DeckStorage_TreeItem,
} from '@cockatrice/sockatrice/generated';

import { flattenDeckTree, formatDeckAge } from './deckTree';

function file(id: number, name: string, creationTime: number): ServerInfo_DeckStorage_TreeItem {
  return create(ServerInfo_DeckStorage_TreeItemSchema, {
    id,
    name,
    file: create(ServerInfo_DeckStorage_FileSchema, { creationTime }),
  });
}

function folder(name: string, items: ServerInfo_DeckStorage_TreeItem[]): ServerInfo_DeckStorage_TreeItem {
  return create(ServerInfo_DeckStorage_TreeItemSchema, {
    name,
    folder: create(ServerInfo_DeckStorage_FolderSchema, { items }),
  });
}

describe('flattenDeckTree', () => {
  it('collects files from nested folders with their path, newest first', () => {
    const root = create(ServerInfo_DeckStorage_FolderSchema, {
      items: [
        file(1, 'Root', 100),
        folder('Cube', [file(2, 'Inner', 300), folder('Old', [file(3, 'Deep', 200)])]),
      ],
    });
    expect(flattenDeckTree(root)).toEqual([
      { id: 2, name: 'Inner', path: 'Cube', creationTime: 300 },
      { id: 3, name: 'Deep', path: 'Cube/Old', creationTime: 200 },
      { id: 1, name: 'Root', path: '', creationTime: 100 },
    ]);
  });

  it('names an unnamed file by its id and skips id-less entries', () => {
    const root = create(ServerInfo_DeckStorage_FolderSchema, {
      items: [file(4, '', 1), file(0, 'Ghost', 2)],
    });
    expect(flattenDeckTree(root)).toEqual([{ id: 4, name: 'Deck #4', path: '', creationTime: 1 }]);
  });

  it('is empty without a tree', () => {
    expect(flattenDeckTree(undefined)).toEqual([]);
  });
});

describe('formatDeckAge', () => {
  const now = Date.UTC(2026, 0, 31, 12, 0, 0);
  const secondsAgo = (s: number) => now / 1000 - s;

  it.each([
    [30, 'just now'],
    [125, '2m ago'],
    [3 * 3600 + 5, '3h ago'],
    [2 * 86400 + 5, '2d ago'],
  ])('formats %ss as %s', (age, expected) => {
    expect(formatDeckAge(secondsAgo(age), now)).toBe(expected);
  });

  it('falls back to a date after a week, and "unknown" without a timestamp', () => {
    expect(formatDeckAge(secondsAgo(8 * 86400), now)).toBe(new Date(now - 8 * 86400 * 1000).toLocaleDateString());
    expect(formatDeckAge(0, now)).toBe('unknown');
  });
});
