import { useMemo } from 'react';

import { useWebClient } from '@cockatrice/datatrice/react';
import { server } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag, type ServerInfo_User } from '@cockatrice/sockatrice/generated';
import { useOpenChat, usePrivateMessageFilter } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';

import { conversationSummaries, type ConversationSummary } from './conversationSummaries';

export interface PersonRow {
  name: string;
  user: ServerInfo_User;
  online: boolean;
}

export interface People {
  conversations: (ConversationSummary & { online: boolean })[];
  buddies: PersonRow[];
  ignored: PersonRow[];
  onlineBuddies: number;
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
  const buddyList = useAppSelector(server.Selectors.getSortedBuddyList);
  const ignoreList = useAppSelector(server.Selectors.getSortedIgnoreList);
  const filter = usePrivateMessageFilter();
  const selfName = self?.name ?? null;

  const conversations = useMemo(() => {
    const visible = Object.fromEntries(Object.entries(messages).map(([peer, list]) => [
      peer,
      visiblePrivateMessages(list, { selfName, peer: users[peer], peerIsBuddy: Boolean(buddyMap[peer]) }, filter, chatFilterVerdicts),
    ]));
    return conversationSummaries(visible, selfName).map((summary) => ({ ...summary, online: Boolean(users[summary.name]) }));
  }, [messages, users, buddyMap, filter, selfName]);

  const buddies = useMemo(
    () => buddyList.map((user) => ({ name: user.name, user, online: Boolean(users[user.name]) })),
    [buddyList, users],
  );
  const ignored = useMemo(
    () => ignoreList.map((user) => ({ name: user.name, user, online: Boolean(users[user.name]) })),
    [ignoreList, users],
  );

  const session = webClient.request.session;
  return {
    conversations,
    buddies,
    ignored,
    onlineBuddies: buddies.filter((buddy) => buddy.online).length,
    canEditLists: ((self?.userLevel ?? 0) & ServerInfo_User_UserLevelFlag.IsRegistered) !== 0,
    openChat,
    addBuddy: (name) => session.addToBuddyList(name),
    removeBuddy: (name) => session.removeFromBuddyList(name),
    addIgnore: (name) => session.addToIgnoreList(name),
    removeIgnore: (name) => session.removeFromIgnoreList(name),
  };
}
