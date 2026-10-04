import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../__test-utils__';
import ShortcutsTab from './ShortcutsTab';

describe('ShortcutsTab', () => {
  it('lists the game groups in desktop order, then the other scopes', () => {
    renderWithProviders(<ShortcutsTab />);
    const headers = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    // Each header reads "<group><count>".
    expect(headers.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual([
      'ShortcutsTab.group.gamePhases',
      'ShortcutsTab.group.gamePlayingArea',
      'ShortcutsTab.group.gameMoveSelected',
      'ShortcutsTab.group.gameView',
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
    const tapRow = within(section('gamePlayingArea')).getByText('ShortcutsTab.action.game.tapCard').closest('div')!.parentElement!;
    expect(within(tapRow).getByText('ShortcutsTab.noBinding')).toBeInTheDocument();
  });

  it('collapses a group from its header button, and every row edits from a button', () => {
    renderWithProviders(<ShortcutsTab />);
    const header = screen.getByRole('button', { name: /ShortcutsTab\.group\.gameHand\d/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('ShortcutsTab.action.game.sortHandByName')).not.toBeInTheDocument();
    // One focusable edit button per visible row.
    const rows = screen.getAllByText(/^ShortcutsTab\.action\./);
    expect(screen.getAllByRole('button', { name: 'ShortcutsTab.edit' })).toHaveLength(rows.length);
  });
});
