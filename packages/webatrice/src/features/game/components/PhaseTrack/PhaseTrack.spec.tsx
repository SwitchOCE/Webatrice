import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Phase } from '@cockatrice/datatrice';

import { createMockWebClient, renderWithProviders } from '../../../../__test-utils__';
import { buildSeatGameState } from '../../__test-utils__/seatFixtures';
import PhaseTrack from './PhaseTrack';

vi.mock('@app/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/hooks')>()),
  usePhaseTrackPinned: () => false,
}));

function renderTrack({ activePlayerId = 1 }: { activePlayerId?: number } = {}) {
  const preloadedState = buildSeatGameState({
    localPlayerId: 1,
    activePlayerId,
    seats: [{ playerId: 1, name: 'Alice' }, { playerId: 2, name: 'Bob' }],
  });
  preloadedState.games!.games![1]!.activePhase = Phase.Upkeep;
  const webClient = createMockWebClient();
  renderWithProviders(<PhaseTrack />, { preloadedState, webClient });
  return { game: webClient.request.game, track: screen.getByRole('navigation', { name: 'PhaseTrack.label' }) };
}

describe('PhaseTrack', () => {
  it('names every phase button while collapsed, and marks the current phase', () => {
    const { track } = renderTrack();
    const phases = within(track).getAllByRole('button').filter((button) => button.dataset.phase !== undefined);
    expect(phases.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Untap',
      'Upkeep',
      'Draw',
      'Main 1',
      'Start Combat',
      'Attack',
      'Block',
      'Damage',
      'End Combat',
      'Main 2',
      'End',
    ]);
    expect(within(track).getByRole('button', { current: 'step' })).toHaveAccessibleName('Upkeep');
  });

  it('expands while focus is inside it and collapses when focus leaves', async () => {
    const user = userEvent.setup();
    const { track } = renderTrack();
    expect(within(track).queryByText('Draw')).not.toBeInTheDocument();
    await user.tab();
    expect(within(track).getByRole('button', { name: 'Untap' })).toHaveFocus();
    expect(within(track).getByText('Draw')).toBeInTheDocument();
    act(() => {
      within(track).getByRole('button', { name: 'Untap' }).blur();
    });
    expect(within(track).queryByText('Draw')).not.toBeInTheDocument();
  });

  it('changes phase from the keyboard', async () => {
    const user = userEvent.setup();
    const { game, track } = renderTrack();
    within(track).getByRole('button', { name: 'Main 1' }).focus();
    await user.keyboard('{Enter}');
    expect(game.setActivePhase).toHaveBeenCalledWith(1, { phase: Phase.FirstMain }, expect.anything());
  });

  it('keeps the buttons focusable but inert for a player who may not change phases', async () => {
    const user = userEvent.setup();
    const { game, track } = renderTrack({ activePlayerId: 2 });
    const main = within(track).getByRole('button', { name: 'Main 1' });
    expect(main).toHaveAttribute('aria-disabled', 'true');
    expect(main).not.toBeDisabled();
    expect(main).toHaveAttribute('title', 'PhaseTrack.activePlayerOnly');
    main.focus();
    await user.keyboard('{Enter}');
    await user.dblClick(within(track).getByRole('button', { name: 'Untap' }));
    expect(game.setActivePhase).not.toHaveBeenCalled();
    expect(game.setCardAttr).not.toHaveBeenCalled();
    expect(within(track).getByRole('button', { current: 'step' })).toHaveAccessibleName('Upkeep');
  });
});
