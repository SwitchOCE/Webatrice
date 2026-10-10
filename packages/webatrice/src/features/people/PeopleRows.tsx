import { useTranslation } from 'react-i18next';
import { Gamepad2, MessageSquare, UserRoundMinus, Volume2 } from 'lucide-react';

import { Avatar, IconButton, UserBadges } from '@app/components';
import { useUserGames } from '@app/feature-widgets/user-games';
import { CountryFlag } from '@app/feature-widgets/chat-dock';
import { cx } from '@app/utils';

import type { ConversationSummary } from './conversationSummaries';
import type { PersonRow } from './usePeople';

const UNREAD_BADGE = cx(
  'inline-flex h-[18px] min-w-[18px] items-center justify-center',
  'rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent',
);

function PresenceAvatar({ name, online, size, ring }: { name: string; online: boolean; size: number; ring: string }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={name} size={size} />
      <span
        aria-hidden
        className={cx('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2', ring, online ? 'bg-success' : 'bg-text-muted')}
      />
    </span>
  );
}

export function ConversationRow({
  summary,
  online,
  unread,
  time,
  onOpen,
}: {
  summary: ConversationSummary;
  online: boolean;
  unread: number;
  time: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const presence = online ? t('PrivateChat.presence.online') : t('PrivateChat.presence.offline');
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('People.conversation.open', { name: summary.name, presence })}
        className={cx(
          'flex w-full items-center gap-3 rounded-ui px-2.5',
          'py-2 text-left hover:bg-bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        )}
      >
        <PresenceAvatar name={summary.name} online={online} size={38} ring="border-bg-surface" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cx('truncate text-[13.5px] text-text-primary', unread > 0 ? 'font-bold' : 'font-semibold')}>
              {summary.name}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-muted">{time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cx('min-w-0 flex-1 truncate text-[12.5px]', unread > 0 ? 'text-text-primary' : 'text-text-muted')}>
              {summary.lastFromSelf && <span className="text-text-muted">{t('People.conversation.you')} </span>}
              {summary.lastText}
            </span>
            {unread > 0 && (
              <span className={UNREAD_BADGE}>
                {unread}
                <span className="sr-only"> {t('People.conversation.unread')}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

export function BuddyRow({
  person,
  canEdit,
  onMessage,
  onRemove,
}: {
  person: PersonRow;
  canEdit: boolean;
  onMessage: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const userGames = useUserGames();
  const { name, user, online } = person;
  return (
    <li className="flex items-center gap-2.5 rounded-ui px-2.5 py-1.5 hover:bg-bg-elevated/60">
      <PresenceAvatar name={name} online={online} size={28} ring="border-bg-surface" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-text-primary">{name}</span>
          <CountryFlag cc={user.country} />
          <UserBadges userLevel={user.userLevel} />
        </span>
        <span className="block text-[11.5px] text-text-muted">
          {online ? t('PrivateChat.presence.online') : t('PrivateChat.presence.offline')}
        </span>
      </span>
      <IconButton size="sm" label={t('People.buddy.message', { name })} disabled={!online} onClick={onMessage}>
        <MessageSquare size={14} />
      </IconButton>
      {userGames && (
        <IconButton size="sm" label={t('People.buddy.showGames', { name })} disabled={!online} onClick={() => userGames.open(name)}>
          <Gamepad2 size={14} />
        </IconButton>
      )}
      <IconButton size="sm" label={t('People.buddy.remove', { name })} disabled={!canEdit} onClick={onRemove}>
        <UserRoundMinus size={14} />
      </IconButton>
    </li>
  );
}

export function IgnoredRow({ person, canEdit, onRemove }: { person: PersonRow; canEdit: boolean; onRemove: () => void }) {
  const { t } = useTranslation();
  const { name, user } = person;
  return (
    <li className="flex items-center gap-2.5 rounded-ui px-2.5 py-1.5 hover:bg-bg-elevated/60">
      <Avatar name={name} size={24} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-[13px] text-text-primary">{name}</span>
        <CountryFlag cc={user.country} />
      </span>
      <IconButton size="sm" label={t('People.ignored.remove', { name })} disabled={!canEdit} onClick={onRemove}>
        <Volume2 size={14} />
      </IconButton>
    </li>
  );
}
