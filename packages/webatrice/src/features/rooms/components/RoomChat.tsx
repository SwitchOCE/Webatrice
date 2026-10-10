import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';

import { Button, Message as MessageBubble, Panel, TextInput, useMentionCompleter } from '@app/components';
import { ReportChatScope } from '@app/dialogs';
import { useChatHighlight, useCommandFailureMessage, useReduxEffect, useRoomChatFilter } from '@app/hooks';
import { chatFilterVerdicts, cx, isPrivilegedUser, isRoomMessageVisible } from '@app/utils';
import { rooms, type Message } from '@cockatrice/datatrice';
import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';

import { chatLineTime, isAlertLine, isBlankLine, isChatHistory, isWelcome, roomChatContext } from './roomChatContext';

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
    () => allMessages?.filter((m) => !isBlankLine(m) && isRoomMessageVisible(m, users, filter, chatFilterVerdicts)),
    [allMessages, users, filter],
  );
  const getChatContext = useCallback(() => roomChatContext(messages), [messages]);
  return (
    <ReportChatScope getChatContext={getChatContext}>
      <RoomChatView {...props} messages={messages} />
    </ReportChatScope>
  );
}

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
    <Panel
      title={(
        <span className="flex items-baseline gap-2">
          {roomName}
          <span className="text-[12px] font-normal text-text-muted">
            <span aria-hidden>· </span>
            {t('RoomChat.subtitle')}
          </span>
        </span>
      )}
      flush
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div
        ref={scrollRef}
        role="log"
        aria-label={t('RoomChat.log', { room: roomName })}
        tabIndex={0}
        className={cx(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-pad py-2',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        )}
      >
        {(!messages || messages.length === 0) && (
          <div className="flex h-full items-center justify-center text-[12px] italic text-text-muted">
            {t('RoomChat.empty')}
          </div>
        )}
        {messages?.map((m, idx) => {
          const privileged = isPrivilegedUser(users[m.name]);
          const highlight = privileged ? highlights.moderator : highlights.user;
          if (isWelcome(m)) {
            return (
              <div key={`${m.timeReceived}-${idx}`} className="whitespace-pre-line text-[13px] leading-relaxed text-accent">
                <MessageBubble message={m} />
              </div>
            );
          }
          const time = chatLineTime(m);
          return (
            <div
              key={`${m.timeReceived}-${idx}`}
              className={cx(
                'flex gap-2 text-[13px] leading-relaxed text-text-primary',
                '[&_a.link]:font-semibold [&_a.link]:text-accent [&_a.link:hover]:underline [&_strong]:mr-1',
                isAlertLine(m, highlight) && '-mx-2 rounded-ui-sm bg-warning/10 px-2',
                isChatHistory(m) && 'opacity-70',
              )}
            >
              <time dateTime={time.dateTime} title={time.full} className="shrink-0 pt-px text-[11px] tabular-nums text-text-muted">
                {time.label}
              </time>
              <div className="min-w-0 flex-1 break-words">
                {m.notice
                  ? <div className="italic text-text-muted">{noticeText(m)}</div>
                  : <MessageBubble message={m} highlight={highlight} />}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-border-subtle p-2">
        <div className="relative min-w-0 flex-1">
          <TextInput
            ref={inputRef}
            icon={null}
            type="text"
            value={draft}
            {...mention.inputProps}
            placeholder={t('RoomChat.input', { room: roomName })}
            aria-label={t('RoomChat.input', { room: roomName })}
          />
          {mention.popup}
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!draft.trim()}
          className="w-9 shrink-0 px-0"
          title={t('Common.action.send')}
          aria-label={t('Common.action.send')}
          icon={<Send size={15} aria-hidden />}
        />
      </form>
    </Panel>
  );
}
