import { groupLobbyDecks, type DeckSummary } from './lobbyDeckGrouping';

describe('groupLobbyDecks', () => {
  const decks = [
    { id: 1, name: 'Zulu' }, { id: 2, name: 'alpha' }, { id: 3, name: 'Modern' },
    { id: 4, name: 'Other' }, { id: 5, name: 'Unknown' }, { id: 6, name: 'Empty format' },
  ];
  const summaries = new Map<number, DeckSummary>([
    [1, { name: 'Zulu', format: 'Commander' }], [2, { name: 'alpha', format: ' commander ' }],
    [3, { name: 'Modern', format: 'modern' }], [4, { name: 'Other', format: 'custom format' }],
    [6, { name: 'Empty format', format: '' }],
  ]);

  it('prioritizes the room format, sorts names, and retains unknown summaries', () => {
    const result = groupLobbyDecks(decks, summaries, 'modern');
    expect(result.map(group => group.category)).toEqual(['modern', 'commander', 'other', 'unknown']);
    expect(result.map(group => group.decks.map(deck => deck.id))).toEqual([[3], [2, 1], [4], [6, 5]]);
    expect(decks.map(deck => deck.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('uses canonical format order when the room has no known format', () => {
    expect(groupLobbyDecks(decks, summaries, 'custom format').map(group => group.category))
      .toEqual(['commander', 'modern', 'other', 'unknown']);
    expect(groupLobbyDecks([], summaries, 'modern')).toEqual([]);
  });
});
