import { act, fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../__test-utils__';
import ShortcutsTab from './ShortcutsTab';

describe('ShortcutsTab', () => {
  it('lists the game groups in desktop order, then the other scopes', () => {
    renderWithProviders(<ShortcutsTab />);
    const headers = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    // Each header reads "<group><count>".
    expect(headers.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual([
      'ShortcutsTab.group.gameCardCounters',
      'ShortcutsTab.group.gamePlayerCounters',
      'ShortcutsTab.group.gamePowerToughness',
      'ShortcutsTab.group.gamePhases',
      'ShortcutsTab.group.gamePlayingArea',
      'ShortcutsTab.group.gameMoveSelected',
      'ShortcutsTab.group.gameView',
      'ShortcutsTab.group.gameMoveTop',
      'ShortcutsTab.group.gameMoveBottom',
      'ShortcutsTab.group.gameplay',
      'ShortcutsTab.group.gameDrawing',
      'ShortcutsTab.group.gameHand',
      'ShortcutsTab.group.game',
      'ShortcutsTab.group.deckEditor',
      'ShortcutsTab.group.room',
      'ShortcutsTab.group.replays',
    ]);
  });

  it('shows each new action under its desktop group, unbound ones as having no binding', () => {
    renderWithProviders(<ShortcutsTab />);
    const section = (group: string) =>
      screen.getByRole('button', { name: new RegExp(`ShortcutsTab\\.group\\.${group}\\d`) }).closest('section')!;
    expect(within(section('gamePlayingArea')).getByText('ShortcutsTab.action.game.tapCard')).toBeInTheDocument();
    expect(within(section('gameMoveSelected')).getByText('ShortcutsTab.action.game.moveSelectedToExile')).toBeInTheDocument();
    expect(within(section('gameView')).getByText('ShortcutsTab.action.game.viewHand')).toBeInTheDocument();
    expect(within(section('gameHand')).getByText('ShortcutsTab.action.game.revealHandToAll')).toBeInTheDocument();
    expect(within(section('gameMoveTop')).getByText('ShortcutsTab.action.game.moveTopToExile')).toBeInTheDocument();
    expect(within(section('gameMoveBottom')).getByText('ShortcutsTab.action.game.drawBottomCard')).toBeInTheDocument();
    expect(within(section('gameplay')).getByText('ShortcutsTab.action.game.shuffleTopCards')).toBeInTheDocument();
    expect(within(section('gameCardCounters')).getByText('ShortcutsTab.action.game.addCounterD')).toBeInTheDocument();
    expect(within(section('gamePlayerCounters')).getByText('ShortcutsTab.action.game.incManaCounterW')).toBeInTheDocument();
    expect(within(section('gamePowerToughness')).getByText('ShortcutsTab.action.game.flowP')).toBeInTheDocument();
    expect(within(section('gamePhases')).getByText('ShortcutsTab.action.game.setPhase10')).toBeInTheDocument();
    const tapRow = within(section('gamePlayingArea')).getByText('ShortcutsTab.action.game.tapCard').closest('div')!.parentElement!;
    expect(within(tapRow).getByText('ShortcutsTab.noBinding')).toBeInTheDocument();
  });

  // jsdom does not turn Enter / Space on a button into a click, so this checks
  // what keyboard use rests on: native, focusable buttons in the tab order.
  it('collapses a group from its focusable header button, and every row edits from a focusable button', () => {
    renderWithProviders(<ShortcutsTab />);
    const header = screen.getByRole('button', { name: /ShortcutsTab\.group\.gameHand\d/ });
    expect(header.tagName).toBe('BUTTON');
    act(() => header.focus());
    expect(header).toHaveFocus();
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('ShortcutsTab.action.game.sortHandByName')).not.toBeInTheDocument();
    // One focusable edit button per visible row.
    const rows = screen.getAllByText(/^ShortcutsTab\.action\./);
    const edits = screen.getAllByRole('button', { name: 'ShortcutsTab.edit' });
    expect(edits).toHaveLength(rows.length);
    expect(edits.filter((b) => b.tagName !== 'BUTTON' || b.tabIndex < 0)).toEqual([]);
  });
});
