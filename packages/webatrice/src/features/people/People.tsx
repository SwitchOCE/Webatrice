import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, UserRoundPlus, VolumeX } from 'lucide-react';

import { AuthGuard, Button, PageTitle, Panel, TextInput } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { useUnreadCounts } from '@app/hooks';
import { cx } from '@app/utils';

import { BuddyRow, ConversationRow, IgnoredRow } from './PeopleRows';
import { usePeople } from './usePeople';

function EmptyNote({ children }: { children: string }) {
  return <p className="px-pad py-6 text-center text-[12.5px] text-text-muted">{children}</p>;
}

interface AddPersonFormProps {
  disabled: boolean;
  onAddBuddy: (name: string) => void;
  onIgnore: (name: string) => void;
}

function AddPersonForm({ disabled, onAddBuddy, onIgnore }: AddPersonFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const run = (fn: (value: string) => void) => {
    if (trimmed) {
      fn(trimmed);
      setName('');
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(onAddBuddy);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2" aria-label={t('People.add.label')}>
      <TextInput
        icon={null}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('People.add.placeholder')}
        aria-label={t('People.add.placeholder')}
        disabled={disabled}
        wrapperClassName="w-[220px]"
      />
      <Button type="submit" variant="primary" icon={<UserRoundPlus size={14} />} disabled={disabled || !trimmed}>
        {t('People.add.buddy')}
      </Button>
      <Button icon={<VolumeX size={14} />} disabled={disabled || !trimmed} onClick={() => run(onIgnore)}>
        {t('People.add.ignore')}
      </Button>
    </form>
  );
}

export default function People() {
  const { t, i18n } = useTranslation();
  const people = usePeople();
  const unread = useUnreadCounts().chats;
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language.replaceAll('_', '-'), { timeStyle: 'short' }),
    [i18n.language],
  );

  return (
    <Layout>
      <AuthGuard />
      <div className="flex h-full min-h-0 flex-col">
        <PageTitle
          title={t('People.title')}
          subtitle={t('People.subtitle')}
          actions={<AddPersonForm disabled={!people.canEditLists} onAddBuddy={people.addBuddy} onIgnore={people.addIgnore} />}
        />
        <div className={cx(
          'grid min-h-0 flex-1 grid-cols-1 gap-gap overflow-auto px-pad pb-pad',
          'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)] lg:overflow-hidden',
        )}>
          <Panel title={t('People.conversations.title')} count={people.conversations.length} flush bodyClassName="flex flex-col">
            {people.conversations.length === 0 ? (
              <EmptyNote>{t('People.conversations.empty')}</EmptyNote>
            ) : (
              <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-2">
                {people.conversations.map((summary) => (
                  <ConversationRow
                    key={summary.name}
                    summary={summary}
                    online={summary.online}
                    unread={unread[summary.name] ?? 0}
                    time={timeFormat.format(summary.lastTime)}
                    onOpen={() => people.openChat(summary.name)}
                  />
                ))}
              </ul>
            )}
            <p className="mt-auto flex items-start gap-2 border-t border-border-subtle px-4 py-3 text-[12px] leading-snug text-text-muted">
              <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
              {t('People.conversations.note')}
            </p>
          </Panel>

          <Panel
            title={t('People.buddies.title')}
            count={t('People.buddies.count', { online: people.onlineBuddies, total: people.buddies.length })}
            flush
            bodyClassName="flex flex-col"
          >
            {people.buddies.length === 0 ? (
              <EmptyNote>{t('People.buddies.empty')}</EmptyNote>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
                {people.buddies.map((person) => (
                  <BuddyRow
                    key={person.name}
                    person={person}
                    canEdit={people.canEditLists}
                    onMessage={() => people.openChat(person.name)}
                    onRemove={() => people.removeBuddy(person.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('People.ignored.title')} count={people.ignored.length} flush bodyClassName="flex flex-col">
            {people.ignored.length === 0 ? (
              <EmptyNote>{t('People.ignored.empty')}</EmptyNote>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
                {people.ignored.map((person) => (
                  <IgnoredRow
                    key={person.name}
                    person={person}
                    canEdit={people.canEditLists}
                    onRemove={() => people.removeIgnore(person.name)}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Layout>
  );
}
