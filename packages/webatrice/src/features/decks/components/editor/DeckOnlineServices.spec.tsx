import { fireEvent, render, screen } from '@testing-library/react';

import { openInNewTab, printHtml, submitFormInNewTab } from '../../browserHandoff';
import type { HydratedDeck } from '../../types';
import { DeckOnlineServices } from './DeckOnlineServices';

vi.mock('../../browserHandoff', () => ({
  openInNewTab: vi.fn(),
  printHtml: vi.fn(),
  submitFormInNewTab: vi.fn(),
}));

const deck: HydratedDeck = {
  name: 'Burn',
  meta: { v: 1, updatedAt: 'x' },
  format: 'modern',
  cards: [{ name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall' }],
};

function renderServices(d: HydratedDeck = deck) {
  render(<DeckOnlineServices deck={d} />);
  fireEvent.click(screen.getByRole('button', { name: 'DeckTools.sendTo' }));
}

describe('DeckOnlineServices', () => {
  it('prints the deck', () => {
    render(<DeckOnlineServices deck={deck} />);
    fireEvent.click(screen.getByRole('button', { name: 'DeckTools.print' }));
    expect(vi.mocked(printHtml).mock.calls[0][0]).toContain('<h1>Burn</h1>');
  });

  it('opens decklist.org / decklist.xyz with the deck in the URL', () => {
    renderServices();
    fireEvent.click(screen.getByRole('button', { name: 'DeckTools.decklistOrg' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckTools.decklistXyz' }));
    expect(vi.mocked(openInNewTab).mock.calls.map(([url]) => new URL(url).host)).toEqual(['www.decklist.org', 'www.decklist.xyz']);
  });

  it('posts the deck to deckstats and TappedOut', () => {
    renderServices();
    fireEvent.click(screen.getByRole('button', { name: 'DeckTools.deckstats' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckTools.tappedout' }));
    expect(vi.mocked(submitFormInNewTab).mock.calls.map(([form]) => form.action)).toEqual([
      'https://deckstats.net/index.php',
      'https://tappedout.net/mtg-decks/paste/',
    ]);
  });

  it('explains and disables the services for an empty deck', () => {
    renderServices({ ...deck, cards: [] });
    expect(screen.getByText('DeckTools.empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DeckTools.decklistOrg' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'DeckTools.tappedout' })).toBeDisabled();
  });
});
