import { fireEvent, screen } from '@testing-library/react';
import { makeRoom } from '@cockatrice/datatrice/testing';

import { connectedState, renderWithProviders } from '../../../__test-utils__';
import { testI18n } from '../../../__test-utils__/renderWithProviders';
import type { HomeData } from '../useHome';
import HomeHero from './HomeHero';
import translations from './HomeHero.i18n.json';

testI18n.addResourceBundle('en-US', 'translation', translations, true, true);

it('caps the room button at 460px with a truncated label and full room tooltip', () => {
  const name = 'A very long room name '.repeat(20).trim();
  const play = vi.fn();
  const home: HomeData = {
    userName: 'Alice', serverName: 'Server', message: null, onlineCount: 1, gamesRunning: 0,
    roomList: [], joinedRoomIds: {}, joinedRooms: [], usualRoom: makeRoom({ roomId: 1, name }),
    usualRoomJoined: true, buddyGames: [], openGames: [], buddiesOnline: [], buddyCount: 0,
    openRoom: vi.fn(), play, createGame: vi.fn(),
  };
  renderWithProviders(<HomeHero home={home} />, { preloadedState: connectedState });

  const button = screen.getByRole('button', { name: `Go to ${name}` });
  expect(button).toHaveClass('min-w-0', 'max-w-[min(460px,100%)]');
  expect(button).toHaveAttribute('title', name);
  expect(screen.getByText(name).parentElement).toHaveClass('min-w-0', 'truncate');
  fireEvent.click(button);
  expect(play).toHaveBeenCalledOnce();
});
