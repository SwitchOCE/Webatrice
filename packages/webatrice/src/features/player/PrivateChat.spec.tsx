import { act, fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { server, type PrivateConversationEntry } from '@cockatrice/datatrice';
import { Event_UserMessageSchema, Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connectedState } from '../../__test-utils__';
import PrivateChat from './PrivateChat';

const message = (senderName: string, text: string): PrivateConversationEntry => ({
  type: 'message',
  message: create(Event_UserMessageSchema, { senderName, receiverName: senderName === 'me' ? 'bob' : 'me', message: text }),
});

const notice = (id: number, kind: 'userLeft' | 'recipientOffline'): PrivateConversationEntry => ({
  type: 'notice',
  notice: { id, kind, position: 0 },
});

function renderChat(props: Partial<React.ComponentProps<typeof PrivateChat>> = {}) {
  const onSend = vi.fn();
  const utils = renderWithProviders(
    <PrivateChat
      peerName="bob"
      selfName="me"
      entries={[]}
      isOnline
      isIgnored={false}
      onSend={onSend}
      {...props}
    />,
    { preloadedState: connectedState },
  );
  return { ...utils, onSend };
}

describe('PrivateChat', () => {
  it('renders messages and notices in conversation order', () => {
    const { container } = renderChat({
      entries: [message('bob', 'hey'), notice(1, 'userLeft'), message('me', 'still there?'), notice(2, 'recipientOffline')],
    });
    const rows = Array.from(container.querySelectorAll('.space-y-2 > div')).map((row) => row.textContent);
    expect(rows).toEqual(['hey', 'PrivateChat.notice.userLeft', 'still there?', 'PrivateChat.notice.recipientOffline']);
  });

  it('explains a message the server never answered', () => {
    renderChat({
      entries: [{ type: 'notice', notice: { id: 9, kind: 'notSent', position: 0, failure: WebsocketTypes.CommandFailure.Timeout } }],
    });
    expect(screen.getByText('PrivateChat.notice.notSent')).toBeInTheDocument();
  });

  it('completes @mentions of the two people in the conversation', () => {
    renderChat();
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: '@' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['@bob', '@me']);
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(input).toHaveValue('@bob ');
  });

  it('shows the peer as online and sends a trimmed draft', () => {
    const { onSend } = renderChat();
    expect(screen.getByTestId('private-chat-presence')).toHaveTextContent('PrivateChat.presence.online');

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.submit(input);
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('');
  });

  it('keeps the draft and explains why while the peer is offline', () => {
    const { onSend } = renderChat({ isOnline: false });
    expect(screen.getByTestId('private-chat-presence')).toHaveTextContent('PrivateChat.presence.offline');
    expect(screen.getByText('PrivateChat.blocked.offline')).toBeInTheDocument();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input);
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('hello');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('refuses to send to a user you have ignored', () => {
    const { onSend } = renderChat({ isIgnored: true });
    expect(screen.getByText('PrivateChat.blocked.ignoring')).toBeInTheDocument();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('restores the unsent text into an empty composer when a send to this peer fails', () => {
    const { store } = renderChat();
    act(() => {
      store.dispatch(server.Actions.privateMessageFailed({
        userName: 'carol', message: 'not for bob', responseCode: Response_ResponseCode.RespChatFlood,
      }));
      store.dispatch(server.Actions.privateMessageFailed({
        userName: 'bob', message: 'are you there?', responseCode: Response_ResponseCode.RespNameNotFound,
      }));
    });
    expect(screen.getByRole('combobox')).toHaveValue('are you there?');
  });

  it('does not overwrite text typed since the failed send', () => {
    const { store } = renderChat();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'newer' } });
    act(() => {
      store.dispatch(server.Actions.privateMessageFailed({
        userName: 'bob', message: 'older', responseCode: Response_ResponseCode.RespChatFlood,
      }));
    });
    expect(screen.getByRole('combobox')).toHaveValue('newer');
  });
});
