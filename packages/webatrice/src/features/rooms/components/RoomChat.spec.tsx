import { act, fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { rooms, type Message } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { Event_RoomSay_RoomMessageType, Event_RoomSaySchema } from '@cockatrice/sockatrice/generated';

import { renderWithProviders, connectedState } from '../../../__test-utils__';
import RoomChat from './RoomChat';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  ...create(Event_RoomSaySchema, { message: 'alice: hello' }),
  timeReceived: 1,
  id: 1,
  ...overrides,
});

function renderChat(messages: Message[] = [], onSay = vi.fn()) {
  return renderWithProviders(
    <RoomChat roomId={1} roomName="Main" messages={messages} onSay={onSay} />,
    { preloadedState: connectedState },
  );
}

describe('RoomChat', () => {
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
    const input = screen.getByRole('textbox');
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
    expect(screen.getByRole('textbox')).toHaveValue('too fast');
  });

  it('keeps what the user has typed since the flooded send', () => {
    const { store } = renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'newer' } });
    act(() => {
      store.dispatch(rooms.Actions.roomSayFailed({ roomId: 1, message: 'too fast', responseCode: 18, timeReceived: 2 }));
    });
    expect(screen.getByRole('textbox')).toHaveValue('newer');
  });
});
