import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send } from 'lucide-react';

import { server, type PrivateConversationEntry } from '@cockatrice/datatrice';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';

interface PrivateChatProps {
  peerName: string;
  selfName: string | null;
  entries: PrivateConversationEntry[];
  isOnline: boolean;
  // The local user has the peer on their ignore list.
  isIgnored: boolean;
  onSend: (message: string) => void;
}

/**
 * Private-chat panel for the Player page. Renders the full conversation
 * with a single peer as a row of message bubbles (own messages align
 * right, incoming align left) and a composer at the bottom.
 *
 * Wire model: `webClient.request.session.message(name, text)` fires
 * Command_Message; the server broadcasts Event_UserMessage back to
 * both parties, the reducer stores it under the OTHER user's name
 * (see server.reducer.users.ts::userMessage), and this component
 * re-renders from that state — no local optimistic buffer needed.
 *
 * Delivery mirrors desktop TabMessage: a rejected send (the peer ignores
 * you, went offline, or you are flooding), or one the server never answered,
 * adds a notice line to the conversation and the unsent text comes back into an empty composer;
 * the peer leaving or rejoining the server is noted in the conversation.
 * Desktop refuses to send while the peer is offline or ignored by you,
 * keeping the draft; here the composer explains why and stays disabled.
 */
export default function PrivateChat({ peerName, selfName, entries, isOnline, isIgnored, onSend }: PrivateChatProps) {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  // Auto-scroll to newest entry on receive / send. Runs on length
  // change so scroll doesn't fight the user while they're reading
  // history and nothing new has arrived.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  useReduxEffect<{ userName: string; message: string }>((action) => {
    if (action.payload.userName === peerName) {
      setDraft((current) => current || action.payload.message);
    }
  }, server.Types.PRIVATE_MESSAGE_FAILED, [peerName]);

  let blockedReason: string | null = null;
  if (isIgnored) {
    blockedReason = t('PrivateChat.blocked.ignoring', { name: peerName });
  } else if (!isOnline) {
    blockedReason = t('PrivateChat.blocked.offline', { name: peerName });
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || blockedReason) {
      return;
    }
    onSend(trimmed);
    setDraft('');
  };

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
        <MessageSquare size={14} className="text-text-muted" />
        <span className="text-sm font-semibold text-text-primary truncate">{peerName}</span>
        <span className="text-xs text-text-muted">· private chat</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-text-muted" data-testid="private-chat-presence">
          <span
            aria-hidden
            className={['h-2 w-2 rounded-full', isOnline ? 'bg-emerald-500' : 'bg-text-muted'].join(' ')}
          />
          {isOnline ? t('PrivateChat.presence.online') : t('PrivateChat.presence.offline')}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-bg-base/40">
        {entries.length === 0 && (
          <div className="h-full flex items-center justify-center text-xs text-text-muted italic">
            No messages yet — say hi.
          </div>
        )}
        {entries.map((entry, index) => {
          if (entry.type === 'notice') {
            return (
              <div key={`notice-${entry.notice.id}`} className="text-center text-xs text-text-muted italic">
                {t(`PrivateChat.notice.${entry.notice.kind}`, {
                  name: peerName,
                  reason: describeFailure(entry.notice.failure, ''),
                })}
              </div>
            );
          }
          const m = entry.message;
          const isSelf = selfName != null && m.senderName === selfName;
          return (
            <div
              key={`message-${index}`}
              className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={[
                  'max-w-[75%] px-3 py-1.5 rounded-lg text-sm whitespace-pre-wrap break-words',
                  isSelf
                    ? 'bg-accent/20 text-text-primary border border-accent/30'
                    : 'bg-bg-elevated text-text-primary border border-border-subtle',
                ].join(' ')}
              >
                {m.message}
              </div>
            </div>
          );
        })}
      </div>

      {blockedReason && (
        <div className="shrink-0 px-4 py-1.5 text-xs text-text-muted border-t border-border-subtle" role="status">
          {blockedReason}
        </div>
      )}
      <form
        onSubmit={send}
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-border-subtle bg-bg-surface"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${peerName}`}
          className={[
            'flex-1 min-w-0 px-3 py-2 rounded-md bg-bg-base border',
            'border-border-subtle text-sm text-text-primary',
            'placeholder:text-text-muted focus:outline-none',
            'focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!draft.trim() || blockedReason !== null}
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
