import { isManaToken, manaCostTokens, manaSymbolUrl } from './manaSymbols';

describe('manaSymbols', () => {
  it('maps bare symbols and braced tokens to the Scryfall CDN, dropping hybrid slashes', () => {
    expect(manaSymbolUrl('W')).toBe('https://svgs.scryfall.io/card-symbols/W.svg');
    expect(manaSymbolUrl('{2}')).toBe('https://svgs.scryfall.io/card-symbols/2.svg');
    expect(manaSymbolUrl('{W/U}')).toBe('https://svgs.scryfall.io/card-symbols/WU.svg');
    expect(manaSymbolUrl('{2/W}')).toBe('https://svgs.scryfall.io/card-symbols/2W.svg');
  });

  it('splits a cost into its tokens', () => {
    expect(manaCostTokens('{3}{G/W}{U}')).toEqual(['{3}', '{G/W}', '{U}']);
    expect(manaCostTokens('')).toEqual([]);
  });

  it('recognises a single symbol token', () => {
    expect(isManaToken('{T}')).toBe(true);
    expect(isManaToken('Add {G}')).toBe(false);
  });
});
