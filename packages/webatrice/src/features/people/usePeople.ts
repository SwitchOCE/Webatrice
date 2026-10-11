import { useMemo } from 'react';

import { useWebClient } from '@cockatrice/datatrice/react';
import { server } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { useOpenChat, usePrivateMessageFilter } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';

import { conversationSummaries, type ConversationSummary } from './conversationSummaries';
import { groupPeople, type PeopleGroups } from './peopleGroups';

export interface People extends PeopleGroups {
  conversations: (ConversationSummary & { online: boolean })[];
  buddyCount: number;
  canEditLists: boolean;
  openChat: (name: string) => void;
  addBuddy: (name: string) => void;
  removeBuddy: (name: string) => void;
  addIgnore: (name: string) => void;
  removeIgnore: (name: string) => void;
}

export function usePeople(): People {
  const webClient = useWebClient();
  const openChat = useOpenChat();
  const self = useAppSelector(server.Selectors.getUser);
  const messages = useAppSelector((state) => state.server.messages);
  const users = useAppSelector(server.Selectors.getUsers);
  const buddyMap = useAppSelector(server.Selectors.getBuddyList);
  const ignoreMap = useAppSelector(server.Selectors.getIgnoreList);
  const locale = useAppSelector((state) => state.server.locale);
  const filter = usePrivateMessageFilter();
  const selfName = self?.name ?? null;

  const conversations = useMemo(() => {
    const visible = Object.fromEntries(Object.entries(messages).map(([peer, list]) => [
      peer,
      visiblePrivateMessages(list, { selfName, peer: users[peer], peerIsBuddy: Boolean(buddyMap[peer]) }, filter, chatFilterVerdicts),
    ]));
    return conversationSummaries(visible, selfName).map((summary) => ({ ...summary, online: Boolean(users[summary.name]) }));
  }, [messages, users, buddyMap, filter, selfName]);

  const groups = useMemo(
    () => groupPeople({ buddyList: buddyMap, ignoreList: ignoreMap, onlineUsers: users, selfName, locale }),
    [buddyMap, ignoreMap, users, selfName, locale],
  );

  const session = webClient.request.session;
  return {
    conversations,
    ...groups,
    buddyCount: groups.onlineBuddies.length + groups.offlineBuddies.length,
    canEditLists: ((self?.userLevel ?? 0) & ServerInfo_User_UserLevelFlag.IsRegistered) !== 0,
    openChat,
    addBuddy: (name) => session.addToBuddyList(name),
    removeBuddy: (name) => session.removeFromBuddyList(name),
    addIgnore: (name) => session.addToIgnoreList(name),
    removeIgnore: (name) => session.removeFromIgnoreList(name),
  };
}
