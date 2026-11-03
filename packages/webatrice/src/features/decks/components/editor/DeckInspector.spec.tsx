import { fireEvent, render, screen } from '@testing-library/react';

import { emptyPriceLookup } from '../../pricing';
import type { DeckCard } from '../../types';
import { DeckInspector, type DeckInspectorProps } from './DeckInspector';

const printings = [
  { name: 'Lightning Bolt', set: 'lea', collectorNumber: '161', scryfallId: 'lea-161' },
  { name: 'Lightning Bolt', set: 'm10', collectorNumber: '146', scryfallId: 'm10-146' },
];

vi.mock('../../hooks/useCardDetail', () => ({
  useCardDetail: () => ({ detail: null, detailLoading: false, browsed: null, pending: null, browse: vi.fn(), back: vi.fn() }),
}));
vi.mock('../../hooks/useCardPrintings', async () => {
  const { emptyPriceLookup: empty } = await import('../../pricing');
  return { useCardPrintings: () => ({ printings, loading: false, error: null, prices: empty() }) };
});

const bolt: DeckCard = {
  name: 'Lightning Bolt',
  quantity: 2,
  category: 'main',
  lookupSource: 'scryfall',
  manaCost: '{R}',
  typeLine: 'Instant',
  set: 'lea',
  imageUri: 'https://cards.scryfall.io/small/front/b.jpg',
};
const sideBolt: DeckCard = { ...bolt, category: 'sideboard', quantity: 1 };

function renderInspector(overrides: Partial<DeckInspectorProps> = {}) {
  const props: DeckInspectorProps = {
    selected: { name: 'Lightning Bolt', category: 'main' },
    index: 0,
    deckCards: [bolt, sideBolt],
    prices: emptyPriceLookup(),
    isCommanderDeck: false,
    onInc: vi.fn(),
    onDelete: vi.fn(),
    onSetCommander: vi.fn(),
    onSetPrinting: vi.fn(),
    onChoosePreviewPrinting: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
  render(<DeckInspector {...props} />);
  return props;
}

describe('DeckInspector', () => {
  it('keeps a sized placeholder until the preview loads and after failure', () => {
    renderInspector();
    const image = screen.getByAltText('Lightning Bolt');
    expect(image).toHaveStyle({ opacity: '0' });
    expect(image.closest('.aspect-\\[5\\/7\\]')).not.toBeNull();
    expect(screen.queryByText('DeckInspector.noImage')).toBeNull();
    fireEvent.load(image);
    expect(image).toHaveStyle({ opacity: '1' });
    expect(screen.queryByText('DeckInspector.noImage')).toBeNull();
    fireEvent.error(image);
    expect(screen.getByText('DeckInspector.noImage')).toBeVisible();
    expect(screen.queryByAltText('Lightning Bolt')).toBeNull();
  });

  it('shows no failure message while candidates load and shows it only when all fail', () => {
    renderInspector({ deckCards: [{
      ...bolt,
      imageUris: [bolt.imageUri!, 'https://img/fallback.jpg'],
    }] });
    const image = screen.getByAltText('Lightning Bolt');
    expect(screen.queryByText('DeckInspector.noImage')).toBeNull();
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', 'https://img/fallback.jpg');
    expect(screen.queryByText('DeckInspector.noImage')).toBeNull();
    fireEvent.error(image);
    expect(screen.getByText('DeckInspector.noImage')).toBeVisible();
    expect(screen.queryByAltText('Lightning Bolt')).toBeNull();
  });

  it('invites a selection before any card is picked', () => {
    renderInspector({ selected: null });
    expect(screen.getByText('DeckInspector.empty')).toBeInTheDocument();
  });

  it('shows the selected row at preview size with its details and price', () => {
    const prices = emptyPriceLookup();
    prices.byName.set('lightning bolt', { usd: 2, tcgplayer: 'https://tcgplayer.example/bolt' });
    renderInspector({ prices });
    expect(screen.getByRole('img', { name: 'Lightning Bolt' }))
      .toHaveAttribute('src', 'https://cards.scryfall.io/normal/front/b.jpg');
    expect(screen.getByRole('button', { name: 'DeckInspector.cardDetails' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Instant')).toBeInTheDocument();
    expect(screen.getByText('LEA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CardDetailDialog\.buy/ })).toHaveAttribute('href', 'https://tcgplayer.example/bolt');
    expect(screen.getByRole('group', { name: 'DeckInspector.mainDeck' })).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: 'DeckInspector.sideboard' })).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.cardDetails' }));
    expect(screen.queryByText('Instant')).toBeNull();
  });

  it('changes the main deck and sideboard counts on their own rows', () => {
    const props = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseMain' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.decreaseMain' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseSide' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.remove' }));
    expect(props.onInc).toHaveBeenNthCalledWith(1, 0, 1);
    expect(props.onInc).toHaveBeenNthCalledWith(2, 0, -1);
    expect(props.onInc).toHaveBeenNthCalledWith(3, 1, 1);
    expect(props.onDelete).toHaveBeenCalledWith(0);
  });

  it('adds the first sideboard copy as a new row', () => {
    const props = renderInspector({ deckCards: [bolt] });
    expect(screen.getByRole('button', { name: 'DeckInspector.decreaseSide' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseSide' }));
    expect(props.onAdd).toHaveBeenCalledWith('Lightning Bolt', 'side', undefined);
  });

  it('targets the selected printing for both counters and the commander switch', () => {
    const props = renderInspector({
      selected: { name: bolt.name, category: 'main', scryfallId: 'm10-146' },
      index: 1,
      deckCards: [
        { ...bolt, scryfallId: 'lea-161' }, { ...bolt, scryfallId: 'm10-146', quantity: 3 },
        { ...sideBolt, scryfallId: 'lea-161' }, { ...sideBolt, scryfallId: 'm10-146', quantity: 4 },
      ],
      isCommanderDeck: true,
    });
    expect(screen.getByRole('group', { name: 'DeckInspector.mainDeck' })).toHaveTextContent('3');
    expect(screen.getByRole('group', { name: 'DeckInspector.sideboard' })).toHaveTextContent('4');
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseMain' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.decreaseSide' }));
    fireEvent.click(screen.getByRole('switch'));
    expect(props.onInc).toHaveBeenNthCalledWith(1, 1, 1);
    expect(props.onInc).toHaveBeenNthCalledWith(2, 3, -1);
    expect(props.onSetCommander).toHaveBeenCalledWith(1, true);
  });

  it('changes the printing of the live row from the printings list', () => {
    const props = renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /DeckInspector\.changePrinting/ }));
    fireEvent.click(screen.getByRole('button', { name: /M10/ }));
    expect(props.onSetPrinting).toHaveBeenCalledWith(0, printings[1]);
  });

  it('marks the commander and keeps it out of the sideboard', () => {
    const props = renderInspector({ deckCards: [{ ...bolt, isCommander: true }], isCommanderDeck: true });
    const toggle = screen.getByRole('switch', { name: 'DeckEditor.rowActions.markCommander' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(props.onSetCommander).toHaveBeenCalledWith(0, false);
    expect(screen.getByRole('button', { name: 'DeckInspector.increaseSide' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'DeckInspector.removeCommander' })).toBeInTheDocument();
  });

  it('offers to add a card that is not in the deck yet', () => {
    const props = renderInspector({
      selected: {
        name: 'Ponder',
        category: 'main',
        scryfallId: 'p1',
        preview: { name: 'Ponder', quantity: 1, category: 'main', lookupSource: 'scryfall', typeLine: 'Sorcery', scryfallId: 'p1' },
      },
      index: -1,
      deckCards: [bolt],
    });
    expect(screen.getByText('DeckInspector.noImage')).toBeInTheDocument();
    expect(screen.getByText('Sorcery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'DeckInspector.remove' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseMain' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckInspector.increaseSide' }));
    expect(props.onAdd).toHaveBeenNthCalledWith(1, 'Ponder', 'main', 'p1');
    expect(props.onAdd).toHaveBeenNthCalledWith(2, 'Ponder', 'side', 'p1');

    fireEvent.click(screen.getByRole('button', { name: /DeckInspector\.changePrinting/ }));
    fireEvent.click(screen.getByRole('button', { name: /M10/ }));
    expect(props.onChoosePreviewPrinting).toHaveBeenCalledWith('m10-146');
  });
});
