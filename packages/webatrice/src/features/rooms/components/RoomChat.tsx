import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Hash } from 'lucide-react';

import { Message as MessageBubble } from '@app/components';
import { useReduxEffect } from '@app/hooks';
import { formatChatHistoryTime } from '@app/utils';
import { rooms, type Message } from '@cockatrice/datatrice';
import { Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';

interface RoomChatProps {
  roomId: number;
  roomName: string;
  messages: Message[] | undefined;
  onSay: (args: { message: string }) => void;
}

// Desktop prefixes chat-history lines (sent on room join) with their server time.
function historyTimestamp(message: Message): string | undefined {
  if (message.messageType !== Event_RoomSay_RoomMessageType.ChatHistory || !message.timeOf) {
    return undefined;
  }
  return formatChatHistoryTime(Number(message.timeOf));
}

/**
 * Fancy-themed chat panel for the room page. Preserves og's rich
 * message parsing (card callouts, @mentions, URLs, Name: prefix) by
 * delegating each row to the `Message` component. Only chrome + input
 * are new; parsing logic is unchanged.
 */
export default function RoomChat({ roomId, roomName, messages, onSay }: RoomChatProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  // The server rejected a message as flooding: the chat shows desktop's warning
  // line, and the unsent text comes back into an empty input so it isn't lost.
  useReduxEffect<{ roomId: number; message: string }>((action) => {
    if (action.payload.roomId === roomId) {
      setDraft((current) => current || action.payload.message);
    }
  }, rooms.Types.ROOM_SAY_FLOODED, [roomId]);

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
    onSay({ message: trimmed });
    setDraft('');
  };

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
        <Hash size={14} className="text-text-muted" />
        <span className="text-sm font-semibold text-text-primary truncate">{roomName}</span>
        <span className="text-xs text-text-muted">· room chat</span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1 bg-bg-base/40">
        {(!messages || messages.length === 0) && (
          <div className="h-full flex items-center justify-center text-xs text-text-muted italic">
            No messages yet — say hi.
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
              ? <div className="italic text-text-muted">{t(`RoomChat.notice.${m.notice}`)}</div>
              : <MessageBubble message={m} timestamp={historyTimestamp(m)} />}
          </div>
        ))}
      </div>

      <form
        onSubmit={send}
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-bg-surface"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${roomName}`}
          className={[
            'flex-1 min-w-0 px-3 py-2 rounded-md bg-bg-base border',
            'border-border-subtle text-sm text-text-primary',
            'placeholder:text-text-muted focus:outline-none',
            'focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className={[
            'p-2 rounded-md bg-accent text-white hover:bg-accent-hover',
            'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          ].join(' ')}
          title="Send"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
