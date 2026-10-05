import { act, screen, within } from '@testing-library/react';
import { games } from '@cockatrice/datatrice';

import { renderWithProviders } from '../../../../__test-utils__';
import { getSettings, settingsStore } from '../../../../hooks/useSettings';
import { buildSeatGameState } from '../../__test-utils__/seatFixtures';
import { GameIdProvider } from '../ui/GameIdContext';
import ChatLog from './ChatLog';

// 14:03:09 local time on some day, and a line logged 1h 2m 5s into the game.
const LOGGED_AT = new Date(2026, 9, 3, 14, 3, 9).getTime();
// Datatrice's MAX_GAME_MESSAGES: a full log drops its oldest line for each new one.
const MAX_GAME_MESSAGES = 1000;

function renderLog() {
  const preloadedState = buildSeatGameState({ localPlayerId: 1, seats: [{ playerId: 1, name: 'Alice' }] });
  preloadedState.games!.games![1]!.messages = [
    { playerId: 1, message: 'gg', timeReceived: LOGGED_AT, gameSeconds: 3725, kind: 'chat', senderName: 'Alice' },
  ];
  return renderWithProviders(
    <GameIdProvider value={1}>
      <ChatLog />
    </GameIdProvider>,
    { preloadedState },
  );
}

describe('ChatLog', () => {
  afterEach(() => {
    settingsStore.reset();
  });

  it('stamps each line with the local time, as desktop does by default', () => {
    renderLog();
    expect(screen.getByText(/gg/).closest('div')).toHaveTextContent('[14:03:09]');
  });

  it('stamps each line with the game time with "Use game time instead of local time" on', async () => {
    const settings = await getSettings();
    await act(async () => {
      settingsStore.setValue(Object.assign(settings, { useGameTime: true }));
    });
    renderLog();
    expect(screen.getByText(/gg/).closest('div')).toHaveTextContent('[01:02:05]');
  });

  describe('as a live region', () => {
    it('is a polite log named by its heading, so new lines are read out as they arrive', () => {
      renderLog();
      const log = screen.getByRole('log', { name: 'ChatLog.heading' });
      expect(log).toHaveAttribute('aria-live', 'polite');
      expect(log).toHaveAttribute('aria-relevant', 'additions');
      // A tab stop, so it scrolls from the keyboard in every browser.
      expect(log).toHaveAttribute('tabindex', '0');
      expect(within(log).getByText(/gg/)).toBeInTheDocument();
    });

    it('names the say box once, by its label', () => {
      renderLog();
      const input = screen.getByRole('combobox', { name: 'ChatLog.inputLabel' });
      expect(input).not.toHaveAttribute('aria-label');
    });

    it('keeps the lines already shown when a new one arrives, so only the new one is read', () => {
      const { store } = renderLog();
      const first = screen.getByText(/gg/).closest('div');
      act(() => {
        store.dispatch(games.Actions.gameSay({ gameId: 1, playerId: 1, message: 'hello', timeReceived: LOGGED_AT }));
      });
      expect(screen.getByText(/gg/).closest('div')).toBe(first);
      expect(screen.getByText(/hello/)).toBeInTheDocument();
    });

    it('keeps the remaining lines when the full log drops its oldest one', () => {
      const preloadedState = buildSeatGameState({ localPlayerId: 1, seats: [{ playerId: 1, name: 'Alice' }] });
      preloadedState.games!.games![1]!.messages = Array.from({ length: MAX_GAME_MESSAGES }, (_, i) => ({
        playerId: 1, message: `line ${i}`, timeReceived: LOGGED_AT + i, kind: 'chat' as const, senderName: 'Alice',
      }));
      const { store } = renderWithProviders(
        <GameIdProvider value={1}>
          <ChatLog />
        </GameIdProvider>,
        { preloadedState },
      );
      const kept = screen.getByText('line 999').closest('div');
      act(() => {
        store.dispatch(games.Actions.gameSay({ gameId: 1, playerId: 1, message: 'newest', timeReceived: LOGGED_AT }));
      });
      expect(screen.queryByText('line 0')).not.toBeInTheDocument();
      expect(screen.getByText('line 999').closest('div')).toBe(kept);
    });
  });
});
