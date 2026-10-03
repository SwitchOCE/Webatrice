import { act, screen } from '@testing-library/react';

import { renderWithProviders } from '../../../../__test-utils__';
import { getSettings, settingsStore } from '../../../../hooks/useSettings';
import { buildSeatGameState } from '../../__test-utils__/seatFixtures';
import { GameIdProvider } from '../ui/GameIdContext';
import ChatLog from './ChatLog';

// 14:03:09 local time on some day, and a line logged 1h 2m 5s into the game.
const LOGGED_AT = new Date(2026, 9, 3, 14, 3, 9).getTime();

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
});
