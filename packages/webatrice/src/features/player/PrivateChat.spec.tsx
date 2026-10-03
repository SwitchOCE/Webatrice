import { act, fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { server, type PrivateConversationEntry } from '@cockatrice/datatrice';
import { Event_UserMessageSchema, Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connectedState } from '../../__test-utils__';
import PrivateChat from './PrivateChat';
import { getSettings, settingsStore } from '../../hooks/useSettings';

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
  it('highlights mentions and alert words without consuming a sender-like body prefix', async () => {
    settingsStore.reset();
    const settings = await getSettings();
    settings.chatHighlightWords = 'cube';
    settings.chatMention = true;
    settingsStore.setValue(settings);
    const { container } = renderChat({ entries: [message('bob', 'note: (@testUser) (cube)')] });
    expect(screen.getByText('@testUser').tagName).toBe('MARK');
    expect(screen.getByText('cube').tagName).toBe('MARK');
    expect(container).toHaveTextContent('note: (@testUser) (cube)');
  });

  it('renders messages and notices in conversation order', () => {
    const { container } = renderChat({
      entries: [message('bob', 'hey'), notice(1, 'userLeft'), message('me', 'still there?'), notice(2, 'recipientOffline')],
    });
    const rows = Array.from(container.querySelectorAll('.space-y-2 > div')).map((row) => row.textContent);
    // Each bubble starts with its sender in visually hidden text, since alignment alone says who wrote it.
    expect(rows).toEqual(['bob: hey', 'PrivateChat.notice.userLeft', 'me: still there?', 'PrivateChat.notice.recipientOffline']);
  });

  it('is a labelled log, so screen readers hear incoming messages', () => {
    renderChat({ entries: [message('bob', 'hey')] });

    const log = screen.getByRole('log', { name: 'PrivateChat.log' });
    expect(log).toHaveTextContent('bob: hey');
    expect(screen.getByRole('textbox', { name: 'PrivateChat.input' })).toBeInTheDocument();
  });

  it('explains a message the server never answered', () => {
    renderChat({
      entries: [{ type: 'notice', notice: { id: 9, kind: 'notSent', position: 0, failure: WebsocketTypes.CommandFailure.Timeout } }],
    });
    expect(screen.getByText('PrivateChat.notice.notSent')).toBeInTheDocument();
  });

  it('shows the peer as online and sends a trimmed draft', () => {
    const { onSend } = renderChat();
    expect(screen.getByTestId('private-chat-presence')).toHaveTextContent('PrivateChat.presence.online');

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.submit(input);
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('');
  });

  it('keeps the draft and explains why while the peer is offline', () => {
    const { onSend } = renderChat({ isOnline: false });
    expect(screen.getByTestId('private-chat-presence')).toHaveTextContent('PrivateChat.presence.offline');
    expect(screen.getByText('PrivateChat.blocked.offline')).toBeInTheDocument();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input);
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('hello');
    expect(screen.getByRole('button', { name: 'PrivateChat.send' })).toBeDisabled();
  });

  it('refuses to send to a user you have ignored', () => {
    const { onSend } = renderChat({ isIgnored: true });
    expect(screen.getByText('PrivateChat.blocked.ignoring')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
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
    expect(screen.getByRole('textbox')).toHaveValue('are you there?');
  });

  it('restores a draft when sending fails synchronously with NotSent', () => {
    const { store, onSend } = renderChat();
    onSend.mockImplementation((message: string) => {
      store.dispatch(server.Actions.privateMessageFailed({
        userName: 'bob', message, responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.NotSent,
      }));
    });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input);
    expect(input).toHaveValue('hello');
  });

  it('does not overwrite text typed since the failed send', () => {
    const { store } = renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'newer' } });
    act(() => {
      store.dispatch(server.Actions.privateMessageFailed({
        userName: 'bob', message: 'older', responseCode: Response_ResponseCode.RespChatFlood,
      }));
    });
    expect(screen.getByRole('textbox')).toHaveValue('newer');
  });
});
