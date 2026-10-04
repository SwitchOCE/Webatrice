import { act, fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { rooms, type Message } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import {
  Event_RoomSay_RoomMessageType,
  Event_RoomSaySchema,
  ServerInfo_User_UserLevelFlag as Level,
} from '@cockatrice/sockatrice/generated';

import { renderWithProviders, connectedState, makeUser } from '../../../__test-utils__';
import { getSettings, settingsStore } from '../../../hooks/useSettings';
import type { Preferences } from '../../../types';
import RoomChat from './RoomChat';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  ...create(Event_RoomSaySchema, { message: 'alice: hello' }),
  timeReceived: 1,
  id: 1,
  ...overrides,
});

function renderChat(messages: Message[] = [], onSay = vi.fn()) {
  return renderWithProviders(
    <RoomChat roomId={1} roomName="Main" messages={messages} users={{}} onSay={onSay} />,
    { preloadedState: connectedState },
  );
}

describe('RoomChat', () => {
  it('is a labelled log with a labelled input, so screen readers hear and can answer the room', () => {
    renderChat([makeMessage({ message: 'hello room' })]);

    expect(screen.getByRole('log', { name: 'RoomChat.log' })).toHaveTextContent('hello room');
    expect(screen.getByRole('combobox', { name: 'RoomChat.input' })).toBeInTheDocument();
  });

  it('prefixes chat history lines with their server time', () => {
    const timeOf = BigInt(new Date(2026, 9, 3, 9, 5, 7).getTime());
    const { container } = renderChat([
      makeMessage({ messageType: Event_RoomSay_RoomMessageType.ChatHistory, timeOf }),
    ]);
    expect(container.querySelector('time')).toHaveTextContent('[3 Oct 2026 09:05:07]');
  });

  it('shows no timestamp on live messages', () => {
    const { container } = renderChat([makeMessage({ timeOf: 5n })]);
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });

  it('renders a chat flood notice', () => {
    renderChat([makeMessage({ message: '', notice: 'chatFlood' })]);
    expect(screen.getByText('RoomChat.notice.chatFlood')).toBeInTheDocument();
  });

  it('renders a not-sent notice with the transport reason', () => {
    renderChat([makeMessage({ message: '', notice: 'notSent', failure: WebsocketTypes.CommandFailure.Timeout })]);
    expect(screen.getByText('RoomChat.notice.notSent')).toBeInTheDocument();
  });

  it('sends the draft and clears the input', () => {
    const onSay = vi.fn();
    renderChat([], onSay);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'hi all' } });
    fireEvent.submit(input);
    expect(onSay).toHaveBeenCalledWith({ message: 'hi all' });
    expect(input).toHaveValue('');
  });

  it('restores the unsent text into an empty input when this room floods', () => {
    const { store } = renderChat();
    act(() => {
      store.dispatch(rooms.Actions.roomSayFailed({ roomId: 2, message: 'other room', responseCode: 18, timeReceived: 1 }));
      store.dispatch(rooms.Actions.roomSayFailed({ roomId: 1, message: 'too fast', responseCode: 18, timeReceived: 2 }));
    });
    expect(screen.getByRole('combobox')).toHaveValue('too fast');
  });

  it('keeps what the user has typed since the flooded send', () => {
    const { store } = renderChat();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'newer' } });
    act(() => {
      store.dispatch(rooms.Actions.roomSayFailed({ roomId: 1, message: 'too fast', responseCode: 18, timeReceived: 2 }));
    });
    expect(screen.getByRole('combobox')).toHaveValue('newer');
  });

  it('completes @mentions from the room\'s user list', () => {
    renderWithProviders(
      <RoomChat
        roomId={1}
        roomName="Main"
        messages={[]}
        users={{ alice: makeUser({ name: 'alice' }), bob: makeUser({ name: 'bob' }) }}
        onSay={vi.fn()}
      />,
      { preloadedState: connectedState },
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'gg @b' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['@bob']);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('gg @bob ');
  });

  describe('chat preferences', () => {
    const say = (name: string, text: string, messageType = Event_RoomSay_RoomMessageType.UserMessage): Message => ({
      ...create(Event_RoomSaySchema, { name, message: `${name}: ${text}`, messageType }),
      timeReceived: 0,
    });

    const users = {
      member: makeUser({ name: 'member', userLevel: Level.IsUser | Level.IsRegistered }),
      guest: makeUser({ name: 'guest', userLevel: Level.IsUser }),
      mod: makeUser({ name: 'mod', userLevel: Level.IsUser | Level.IsRegistered | Level.IsModerator }),
    };

    // Fresh objects per render: the filters remember each line's verdict.
    const messages = (): Message[] => [
      makeMessage({ message: 'old: earlier', messageType: Event_RoomSay_RoomMessageType.ChatHistory }),
      say('member', 'hello @TestUser'),
      say('guest', 'guest says hi'),
      say('mod', '@/all restart soon'),
      makeMessage({ message: '', notice: 'chatFlood' }),
    ];

    const setPreferences = async (patch: Partial<Preferences>) => {
      const settings = await getSettings();
      Object.assign(settings, patch);
      settingsStore.setValue(settings);
    };

    const renderWithUsers = (lines = messages()) =>
      renderWithProviders(<RoomChat roomId={1} roomName="Main" messages={lines} users={users} onSay={vi.fn()} />, {
        preloadedState: connectedState,
      });

    beforeEach(async () => {
      settingsStore.reset();
      await getSettings();
    });

    it('shows history and every sender by default, highlighting the reader’s mention and a moderator’s @/all', () => {
      renderWithUsers();

      expect(screen.getByText(/earlier/)).toBeInTheDocument();
      expect(screen.getByText(/guest says hi/)).toBeInTheDocument();
      expect(screen.getByText('@TestUser').tagName).toBe('MARK');
      expect(screen.getByText('@/all').tagName).toBe('MARK');
    });

    it('hides join history when room history is off, keeping notices', async () => {
      await setPreferences({ roomHistory: false });
      renderWithUsers();

      expect(screen.queryByText(/earlier/)).not.toBeInTheDocument();
      expect(screen.getByText(/guest says hi/)).toBeInTheDocument();
      expect(screen.getByText('RoomChat.notice.chatFlood')).toBeInTheDocument();
    });

    it('hides unregistered senders when asked, keeping notices', async () => {
      await setPreferences({ ignoreUnregisteredUsers: true });
      renderWithUsers();

      expect(screen.queryByText(/guest says hi/)).not.toBeInTheDocument();
      expect(screen.getByText(/hello/)).toBeInTheDocument();
      expect(screen.getByText('RoomChat.notice.chatFlood')).toBeInTheDocument();
    });

    it('keeps a filtered line hidden after its sender leaves the room', async () => {
      await setPreferences({ ignoreUnregisteredUsers: true });
      const lines = messages();
      const { rerender } = renderWithUsers(lines);
      expect(screen.queryByText(/guest says hi/)).not.toBeInTheDocument();

      const { guest: _left, ...remaining } = users;
      rerender(<RoomChat roomId={1} roomName="Main" messages={lines} users={remaining} onSay={vi.fn()} />);

      expect(screen.queryByText(/guest says hi/)).not.toBeInTheDocument();
    });

    it('keeps the lines it showed when a filter is turned on later', async () => {
      const lines = messages();
      const { rerender } = renderWithUsers(lines);

      await act(async () => {
        await setPreferences({ ignoreUnregisteredUsers: true });
      });
      rerender(<RoomChat roomId={1} roomName="Main" messages={lines} users={users} onSay={vi.fn()} />);

      expect(screen.getByText(/guest says hi/)).toBeInTheDocument();
    });

    it('follows a preference change while open', async () => {
      renderWithUsers();
      expect(screen.getByText('@TestUser').tagName).toBe('MARK');

      await act(async () => {
        await setPreferences({ chatMention: false });
      });

      expect(screen.queryByText('@TestUser')).not.toBeInTheDocument();
      expect(screen.getByText(/hello @TestUser/)).toBeInTheDocument();
    });
  });
});
