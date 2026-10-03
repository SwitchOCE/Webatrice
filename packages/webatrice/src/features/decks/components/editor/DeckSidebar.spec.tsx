import { fireEvent, render, screen } from '@testing-library/react';

import { emptyPriceLookup } from '../../pricing';
import type { HydratedDeck } from '../../types';
import { DeckSidebar, type DeckSidebarProps } from './DeckSidebar';

const deck: HydratedDeck = {
  name: 'Burn',
  meta: { v: 1, updatedAt: 'x' },
  format: 'modern',
  cards: [{ name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall' }],
};

function renderSidebar(overrides: Partial<DeckSidebarProps> = {}) {
  const props: DeckSidebarProps = {
    deck,
    saveState: 'idle',
    onRetrySave: vi.fn(),
    totalMainboardCount: 4,
    totalSideboardCount: 0,
    onNameChange: vi.fn(),
    onFormatChange: vi.fn(),
    onExport: vi.fn(),
    previewCard: null,
    prices: emptyPriceLookup(),
    pricesLoading: false,
    isMtg: true,
    ...overrides,
  };
  render(<DeckSidebar {...props} />);
  return props;
}

describe('DeckSidebar', () => {
  it('edits the name and format, and opens the exporter', () => {
    const props = renderSidebar();
    fireEvent.change(screen.getByDisplayValue('Burn'), { target: { value: 'Burn 2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'legacy' } });
    fireEvent.click(screen.getByRole('button', { name: /Export deck/ }));
    expect(props.onNameChange).toHaveBeenCalledWith('Burn 2');
    expect(props.onFormatChange).toHaveBeenCalledWith('legacy');
    expect(props.onExport).toHaveBeenCalled();
  });

  it('offers Share deck... only when given a handler', () => {
    const onShare = vi.fn();
    renderSidebar({ onShare });
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.shareDeck/ }));
    expect(onShare).toHaveBeenCalled();
  });

  it('has no share button on a server without share links', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: /DeckSharing.shareDeck/ })).toBeNull();
  });

  it('shows the totals and the save state', () => {
    renderSidebar({ totalSideboardCount: 2, saveState: 'dirty' });
    expect(screen.getByText('4 cards · 2 sideboard')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it.each([
    ['saving', 'Saving…'],
    ['saved', 'Saved'],
  ] as const)('shows %s', (saveState, label) => {
    renderSidebar({ saveState });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('reports a failed save and retries it', () => {
    const props = renderSidebar({ saveState: 'failed' });
    expect(screen.getByRole('alert')).toHaveTextContent('DeckSidebar.saveFailed');
    fireEvent.click(screen.getByRole('button', { name: 'DeckSidebar.retrySave' }));
    expect(props.onRetrySave).toHaveBeenCalled();
  });

  it('shows the buy pill and preview only for MTG decks', () => {
    renderSidebar();
    expect(screen.getByText('Buy deck @ TCGplayer')).toBeInTheDocument();
    expect(screen.getByText('Hover a card to preview')).toBeInTheDocument();
  });

  it('hides MTG-only features for other decks', () => {
    renderSidebar({ isMtg: false });
    expect(screen.queryByText('Buy deck @ TCGplayer')).toBeNull();
    expect(screen.queryByText('Hover a card to preview')).toBeNull();
  });
});
