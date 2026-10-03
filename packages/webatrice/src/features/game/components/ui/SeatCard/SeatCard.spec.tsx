import { render } from '@testing-library/react';

import Card from './SeatCard';

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const imgSrc = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src');

describe('SeatCard image', () => {
  it('loads the chosen printing by Scryfall id', () => {
    const { container } = render(<Card name="Rhino, Warrior Token" scryfallId={ID} />);
    expect(imgSrc(container)).toBe(`https://api.scryfall.com/cards/${ID}?format=image&version=large`);
  });

  it('loads a name-only card by its exact name without the Token suffix', () => {
    const { container } = render(<Card name="Rhino, Warrior Token" />);
    expect(imgSrc(container))
      .toBe('https://api.scryfall.com/cards/named?exact=Rhino%2C%20Warrior&format=image&version=large');
  });

  it('keeps a name that is only the word Token', () => {
    const { container } = render(<Card name="Token" scryfallId="" />);
    expect(imgSrc(container)).toBe('https://api.scryfall.com/cards/named?exact=Token&format=image&version=large');
  });
});
