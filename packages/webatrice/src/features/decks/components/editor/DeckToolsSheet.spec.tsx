import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { getSettings, settingsStore } from '@app/hooks';
import { CommanderSpellbookIntegration } from '@app/types';

import { writeBracketLookupsMode } from '../../bracketConsent';
import type { DeckCard } from '../../types';
import { DeckToolsSheet } from './DeckToolsSheet';

vi.mock('../breakdown/BracketSection', () => ({ BracketSection: () => <div>bracket section</div> }));

const cards: DeckCard[] = [
  { name: 'Forest', quantity: 10, category: 'main', lookupSource: 'scryfall', typeLine: 'Basic Land — Forest' },
  { name: 'Elves', quantity: 4, category: 'main', lookupSource: 'scryfall', typeLine: 'Creature', cmc: 1, colors: ['G'] },
];

const tab = (name: string) => screen.getByRole('tab', { name });

describe('DeckToolsSheet', () => {
  it('opens on the deck stats and switches tabs', () => {
    render(<DeckToolsSheet cards={cards} format="modern" isMtg />);
    expect(tab('DeckEditor.tools.stats')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('DeckBreakdown.stat.total')).toBeInTheDocument();

    fireEvent.click(tab('SampleHand.title'));
    expect(tab('SampleHand.title')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'SampleHand.redraw' })).toBeInTheDocument();
    expect(screen.queryByText('DeckBreakdown.stat.total')).toBeNull();
  });

  it('hides its panel and shows it again', () => {
    render(<DeckToolsSheet cards={cards} format="modern" isMtg />);
    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.tools.collapse' }));
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(tab('DeckEditor.tools.stats')).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.tools.expand' }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('navigates every tab with arrows, Home and End, keeping panel relationships and roving focus', async () => {
    render(<DeckToolsSheet cards={cards} format="commander" isMtg />);
    const stats = tab('DeckEditor.tools.stats');
    const bracket = tab('DeckBreakdown.bracketEstimate');
    const hand = tab('SampleHand.title');
    stats.focus();
    const user = userEvent.setup();
    for (const [key, target] of [
      ['{ArrowRight}', bracket], ['{ArrowRight}', hand], ['{ArrowRight}', stats],
      ['{ArrowLeft}', hand], ['{Home}', stats], ['{End}', hand],
    ] as const) {
      await user.keyboard(key);
      expect(target).toHaveFocus();
      expect(target).toHaveAttribute('aria-selected', 'true');
      expect(target).toHaveAttribute('tabindex', '0');
      const panel = screen.getByRole('tabpanel');
      expect(target).toHaveAttribute('aria-controls', panel.id);
      expect(panel).toHaveAttribute('aria-labelledby', target.id);
      expect(screen.getAllByRole('tab').filter((node) => node.tabIndex === 0)).toEqual([target]);
    }
  });

  it('uses only the available tabs and opens the sheet on keyboard selection', async () => {
    render(<DeckToolsSheet cards={cards} format="modern" isMtg />);
    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.tools.collapse' }));
    tab('DeckEditor.tools.stats').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('SampleHand.title')).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toBeVisible();
  });

  it('offers the bracket estimate for commander-family formats only', () => {
    const { rerender } = render(<DeckToolsSheet cards={cards} format="modern" isMtg />);
    expect(screen.queryByRole('tab', { name: 'DeckBreakdown.bracketEstimate' })).toBeNull();

    rerender(<DeckToolsSheet cards={cards} format="paupercommander" isMtg />);
    fireEvent.click(tab('DeckBreakdown.bracketEstimate'));
    expect(screen.getByText('bracket section')).toBeInTheDocument();
  });

  it('leaves the bracket estimate out when Commander Spellbook is disabled', async () => {
    settingsStore.reset();
    await getSettings();
    await act(() => writeBracketLookupsMode(CommanderSpellbookIntegration.Disabled));

    render(<DeckToolsSheet cards={cards} format="commander" isMtg />);

    expect(screen.queryByRole('tab', { name: 'DeckBreakdown.bracketEstimate' })).toBeNull();
    settingsStore.reset();
  });

  it('shows only the sample hand for decks that are not Magic', () => {
    render(<DeckToolsSheet cards={cards} format="" isMtg={false} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['SampleHand.title']);
  });
});
