import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { useWebClient } from '@cockatrice/datatrice/react';
import { server, type PrivateConversationEntry } from '@cockatrice/datatrice';
import { usePrivateMessageFilter } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';
import { ServerInfo_User } from '@cockatrice/sockatrice/generated';

const NO_CONVERSATION: PrivateConversationEntry[] = [];

export interface PlayerViewModel {
  name: string | null;
  userInfo: ServerInfo_User | undefined;
  currentUser: ServerInfo_User | null;
  isSelf: boolean;
  isABuddy: boolean;
  isIgnored: boolean;
  // Private-chat history with this user (both sides), with the client's
  // notices (delivery failures, the user leaving/joining) in place, less the
  // messages the Chat preferences filter out. Empty until the first message
  // goes either way. The reducer keys both sent + received under the OTHER
  // user's name, so a single lookup returns the conversation.
  conversation: PrivateConversationEntry[];
  // Whether the user is in the server's online user list.
  isOnline: boolean;

  onAddBuddy: () => void;
  onRemoveBuddy: () => void;
  onAddIgnore: () => void;
  onRemoveIgnore: () => void;
  onSendMessage: (message: string) => void;
}

export function usePlayer(): PlayerViewModel {
  const webClient = useWebClient();
  const params = useParams<{ name?: string }>();
  const name = params.name ?? null;

  const userInfo = useAppSelector((state) =>
    name ? server.Selectors.getUserInfoByName(state, name) : undefined,
  );
  const currentUser = useAppSelector(server.Selectors.getUser);
  const buddyList = useAppSelector(server.Selectors.getBuddyList);
  const ignoreList = useAppSelector(server.Selectors.getIgnoreList);
  const fullConversation = useAppSelector((state) =>
    name ? server.Selectors.getPrivateConversation(state, name) : NO_CONVERSATION,
  );
  const isOnline = useAppSelector((state) => Boolean(name && server.Selectors.getIsUserOnline(state, name)));
  const onlinePeer = useAppSelector((state) => (name ? server.Selectors.getUsers(state)[name] : undefined));
  const privateMessageFilter = usePrivateMessageFilter();

  useEffect(() => {
    if (name) {
      webClient.request.session.getUserInfo(name);
    }
  }, [name, webClient]);

  const { isSelf, isABuddy, isIgnored } = useMemo(() => ({
    isSelf: Boolean(currentUser && name && currentUser.name === name),
    isABuddy: Boolean(name && buddyList[name]),
    isIgnored: Boolean(name && ignoreList[name]),
  }), [currentUser, name, buddyList, ignoreList]);

  // Settings → Chat private-message filters apply to messages, each keeping the
  // verdict PrivateMessageNotifier gave it on arrival; the client's notices stay
  // where Datatrice put them.
  const conversation = useMemo(() => {
    const messages = fullConversation.flatMap((entry) => (entry.type === 'message' ? [entry.message] : []));
    const visible = new Set(visiblePrivateMessages(
      messages,
      { selfName: currentUser?.name ?? null, peer: onlinePeer, peerIsBuddy: isABuddy },
      privateMessageFilter,
      chatFilterVerdicts,
    ));
    return visible.size === messages.length
      ? fullConversation
      : fullConversation.filter((entry) => entry.type === 'notice' || visible.has(entry.message));
  }, [fullConversation, currentUser, onlinePeer, isABuddy, privateMessageFilter]);

  const onAddBuddy = () => name && webClient.request.session.addToBuddyList(name);
  const onRemoveBuddy = () => name && webClient.request.session.removeFromBuddyList(name);
  const onAddIgnore = () => name && webClient.request.session.addToIgnoreList(name);
  const onRemoveIgnore = () => name && webClient.request.session.removeFromIgnoreList(name);
  const onSendMessage = (message: string) => name && webClient.request.session.message(name, message);

  return {
    name,
    userInfo,
    currentUser,
    isSelf,
    isABuddy,
    isIgnored,
    conversation,
    isOnline,
    onAddBuddy,
    onRemoveBuddy,
    onAddIgnore,
    onRemoveIgnore,
    onSendMessage,
  };
}
