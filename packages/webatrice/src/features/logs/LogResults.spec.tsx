import { fireEvent, screen } from '@testing-library/react';
import type { ServerStateLogs } from '@cockatrice/datatrice';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';

import { renderWithProviders, disconnectedState } from '../../__test-utils__';
import LogResults from './LogResults';
import catalog from './Logs.i18n.json';

const makeMessage = (overrides = {}) =>
  ({
    time: '2024-01-01',
    senderName: 'sender',
    senderIp: '1.2.3.4',
    message: 'a message',
    targetId: 't1',
    targetName: 'target',
    ...overrides,
  }) as any;

describe('LogResults', () => {
  it('renders the three log tabs', () => {
    const logs: ServerStateLogs = { room: [], game: [], chat: [] };
    renderWithProviders(<LogResults logs={logs} />, { preloadedState: disconnectedState });

    expect(screen.getByRole('tab', { name: /Logs\.tab\.rooms/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Logs\.tab\.games/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Logs\.tab\.chats/ })).toBeInTheDocument();
  });

  it('shows the room log rows on the default tab', () => {
    const logs: ServerStateLogs = {
      room: [makeMessage({ message: 'room-log-entry' })],
      game: [],
      chat: [],
    };
    renderWithProviders(<LogResults logs={logs} />, { preloadedState: disconnectedState });
    expect(screen.getByText('room-log-entry')).toBeInTheDocument();
  });

  it('includes a count badge in the tab label when logs are present', async () => {
    const i18n = createInstance();
    await i18n.use(ICU).init({
      lng: 'en-US',
      resources: { 'en-US': { translation: catalog } },
      interpolation: { escapeValue: false },
    });
    const logs: ServerStateLogs = {
      room: [makeMessage(), makeMessage()],
      game: [],
      chat: [],
    };
    renderWithProviders(
      <I18nextProvider i18n={i18n}><LogResults logs={logs} /></I18nextProvider>,
      { preloadedState: disconnectedState },
    );
    expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName('Room Logs [2]');
    expect(screen.getAllByRole('tab')[1]).toHaveAccessibleName('Game Logs');
    expect(screen.getAllByRole('tab')[2]).toHaveAccessibleName('Chat Logs');
  });

  it('switches to the games tab when clicked', () => {
    const logs: ServerStateLogs = {
      room: [],
      game: [makeMessage({ message: 'game-log-entry' })],
      chat: [],
    };
    renderWithProviders(<LogResults logs={logs} />, { preloadedState: disconnectedState });

    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(screen.getByText('game-log-entry')).toBeInTheDocument();
  });
});
