import { stageDeckDocument, takeStagedDeck } from './deckHandoff';

describe('deckHandoff', () => {
  it('reads a staged deck document back exactly once', () => {
    const token = stageDeckDocument('<cockatrice_deck/>');
    expect(takeStagedDeck(token)).toBe('<cockatrice_deck/>');
    expect(takeStagedDeck(token)).toBeUndefined();
  });

  it('gives every staging its own token', () => {
    const a = stageDeckDocument('a');
    const b = stageDeckDocument('b');
    expect(a).not.toBe(b);
    expect(takeStagedDeck(b)).toBe('b');
    expect(takeStagedDeck(a)).toBe('a');
  });

  it('knows nothing of an unknown token', () => {
    expect(takeStagedDeck('nope')).toBeUndefined();
  });
});
