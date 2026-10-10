import { act, fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { Event_UserMessageSchema } from '@cockatrice/sockatrice/generated';

import { connectedState, makeUser, renderWithProviders } from '../../__test-utils__';
import { dispatchChatDock, getChatDockState } from '../../hooks/useChatDock';
import { getSettings, settingsStore } from '../../hooks/useSettings';
import { UserGamesProvider } from '../../feature-widgets/user-games';
import People from './People';

const message = (senderName: string, receiverName: string, text: string, timeReceived: number) =>
  Object.assign(create(Event_UserMessageSchema, { senderName, receiverName, message: text }), { timeReceived });

const state = {
  ...connectedState,
  server: {
    ...connectedState.server!,
    user: makeUser({ name: 'me', userLevel: 3 }),
    users: { alice: makeUser({ name: 'alice', userLevel: 3 }) },
    buddyList: { alice: makeUser({ name: 'alice', userLevel: 3 }), carol: makeUser({ name: 'carol', userLevel: 3 }) },
    ignoreList: { troll: makeUser({ name: 'troll', userLevel: 3 }) },
    messages: {
      alice: [message('alice', 'me', 'first', 1)],
      bob: [message('me', 'bob', 'later', 2)],
    },
  },
};

const renderPeople = () => renderWithProviders(<UserGamesProvider><People /></UserGamesProvider>, { preloadedState: state });

describe('People', () => {
  beforeEach(async () => {
    settingsStore.reset();
    await getSettings();
  });

  afterEach(() => {
    act(() => dispatchChatDock({ type: 'reset' }));
  });

  it('lists this session\'s conversations newest first and opens one in the dock', () => {
    renderPeople();
    const rows = screen.getAllByRole('button', { name: 'People.conversation.open' });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('bob'),
      expect.stringContaining('alice'),
    ]);
    fireEvent.click(rows[1]);
    expect(getChatDockState().chats).toEqual([{ name: 'alice', expanded: true }]);
  });

  it('shows buddies with their online state and actions', () => {
    const { webClient } = renderPeople();
    const buddies = screen.getByRole('heading', { name: 'People.buddies.title' }).closest('section')!;
    const items = within(buddies).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const carol = items.find((item) => item.textContent?.includes('carol'))!;
    expect(within(carol).getByRole('button', { name: 'People.buddy.message' })).toBeDisabled();
    fireEvent.click(within(carol).getByRole('button', { name: 'People.buddy.remove' }));
    expect(webClient.request.session.removeFromBuddyList).toHaveBeenCalledWith('carol');
  });

  it('removes someone from the ignore list', () => {
    const { webClient } = renderPeople();
    fireEvent.click(screen.getByRole('button', { name: 'People.ignored.remove' }));
    expect(webClient.request.session.removeFromIgnoreList).toHaveBeenCalledWith('troll');
  });

  it('adds a buddy or an ignore by name', () => {
    const { webClient } = renderPeople();
    const input = screen.getByRole('textbox', { name: 'People.add.placeholder' });
    fireEvent.change(input, { target: { value: ' dave ' } });
    fireEvent.click(screen.getByRole('button', { name: 'People.add.buddy' }));
    expect(webClient.request.session.addToBuddyList).toHaveBeenCalledWith('dave');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'eve' } });
    fireEvent.click(screen.getByRole('button', { name: 'People.add.ignore' }));
    expect(webClient.request.session.addToIgnoreList).toHaveBeenCalledWith('eve');
  });
});
