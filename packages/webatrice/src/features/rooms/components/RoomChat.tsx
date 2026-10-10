import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Hash } from 'lucide-react';

import { Message as MessageBubble, useMentionCompleter } from '@app/components';
import { ReportChatScope } from '@app/dialogs';
import { useChatHighlight, useCommandFailureMessage, useReduxEffect, useRoomChatFilter } from '@app/hooks';
import { chatFilterVerdicts, isPrivilegedUser, isRoomMessageVisible } from '@app/utils';
import { rooms, type Message } from '@cockatrice/datatrice';
import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';

import { historyTimestamp, roomChatContext } from './roomChatContext';

interface RoomChatProps {
  roomId: number;
  roomName: string;
  messages: Message[] | undefined;
  users: Readonly<Record<string, ServerInfo_User>>;
  onSay: (args: { message: string }) => void;
}

export default function RoomChat(props: RoomChatProps) {
  const { messages: allMessages, users } = props;
  const filter = useRoomChatFilter();
  const messages = useMemo(
    () => allMessages?.filter((m) => isRoomMessageVisible(m, users, filter, chatFilterVerdicts)),
    [allMessages, users, filter],
  );
  const getChatContext = useCallback(() => roomChatContext(messages), [messages]);
  return (
    <ReportChatScope getChatContext={getChatContext}>
      <RoomChatView {...props} messages={messages} />
    </ReportChatScope>
  );
}

/**
 * Fancy-themed chat panel for the room page. Preserves og's rich
 * message parsing (card callouts, @mentions, URLs, Name: prefix) by
 * delegating each row to the `Message` component. Only chrome + input
 * are new; parsing logic is unchanged.
 */
function RoomChatView({ roomId, roomName, messages, users, onSay }: RoomChatProps) {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const noticeText = (m: Message) =>
    t(`RoomChat.notice.${m.notice}`, { reason: describeFailure(m.failure, '') });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const userNames = useMemo(() => Object.keys(users), [users]);
  const mention = useMentionCompleter({ names: userNames, value: draft, onValueChange: setDraft, inputRef });
  const highlights = useChatHighlight();

  useReduxEffect<{ roomId: number; message: string }>((action) => {
    if (action.payload.roomId === roomId) {
      setDraft((current) => current || action.payload.message);
    }
  }, rooms.Types.ROOM_SAY_FAILED, [roomId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages?.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    setDraft('');
    onSay({ message: trimmed });
  };

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
        <Hash size={14} className="text-text-muted" />
        <span className="text-sm font-semibold text-text-primary truncate">{roomName}</span>
        <span className="text-xs text-text-muted">
          <span aria-hidden>· </span>
          {t('RoomChat.subtitle')}
        </span>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label={t('RoomChat.log', { room: roomName })}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1 bg-bg-base/40"
      >
        {(!messages || messages.length === 0) && (
          <div className="h-full flex items-center justify-center text-xs text-text-muted italic">
            {t('RoomChat.empty')}
          </div>
        )}
        {messages?.map((m, idx) => (
          <div
            key={`${m.timeReceived}-${idx}`}
            className={[
              'text-sm text-text-secondary [&_a.link]:text-accent [&_a.link]:hover:text-accent-hover',
              '[&_strong]:text-text-primary [&_strong]:mr-1',
            ].join(' ')}
          >
            {m.notice
              ? <div className="italic text-text-muted">{noticeText(m)}</div>
              : (
                <MessageBubble
                  message={m}
                  timestamp={historyTimestamp(m)}
                  highlight={isPrivilegedUser(users[m.name]) ? highlights.moderator : highlights.user}
                />
              )}
          </div>
        ))}
      </div>

      <form
        onSubmit={send}
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-bg-surface"
      >
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            {...mention.inputProps}
            placeholder={t('RoomChat.input', { room: roomName })}
            aria-label={t('RoomChat.input', { room: roomName })}
            className={[
              'w-full px-3 py-2 rounded-md bg-bg-base border',
              'border-border-control text-sm text-text-primary',
              'placeholder:text-text-muted focus:outline-none',
              'focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
            ].join(' ')}
          />
          {mention.popup}
        </div>
        <button
          type="submit"
          disabled={!draft.trim()}
          className={[
            'p-2 rounded-md bg-accent text-on-accent hover:bg-accent-hover',
            'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          ].join(' ')}
          title={t('Common.action.send')}
          aria-label={t('Common.action.send')}
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
