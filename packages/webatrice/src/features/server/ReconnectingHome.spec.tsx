import type { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';

import { connectedState, renderWithProviders } from '../../__test-utils__';
import { testI18n } from '../../__test-utils__/renderWithProviders';
import type { HomeSnapshot } from '../../services/storage/homeSnapshot';
import ReconnectingHome from './ReconnectingHome';
import translations from './components/HomeHero.i18n.json';

vi.mock('@app/feature-wrappers/layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

testI18n.addResourceBundle('en-US', 'translation', translations, true, true);

it('caps the reconnecting room button at 460px with a truncated label and full room tooltip', () => {
  const name = 'A very long room name '.repeat(20).trim();
  const snapshot: HomeSnapshot = {
    version: 1, host: 'localhost', userName: 'Alice', serverName: 'Server', onlineCount: 1, gamesRunning: 0,
    rooms: [{ id: 1, name, games: 0, people: 1 }], usualRoomId: 1, openGames: [], buddiesOnline: 0, buddyCount: 0,
  };
  renderWithProviders(<ReconnectingHome snapshot={snapshot} />, { preloadedState: connectedState });

  const button = screen.getByRole('button', { name: `Go to ${name}` });
  expect(button).toHaveClass('min-w-0', 'max-w-[min(460px,100%)]');
  expect(button).toHaveAttribute('title', name);
  expect(within(button).getByText(name).parentElement).toHaveClass('min-w-0', 'truncate');
  expect(button).toBeDisabled();
});
