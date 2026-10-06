import { useMemo } from 'react';
import { server } from '@cockatrice/datatrice';

import { useAppSelector } from '@app/store';
import {
  highlightStyle,
  parseHighlightWords,
  type ChatHighlight,
  type PrivateMessageFilter,
  type RoomChatFilter,
} from '@app/utils';

import { usePreferences } from './useSettings';

/** Which room chat lines to show, from the Chat preferences. */
export function useRoomChatFilter(): RoomChatFilter {
  const { roomHistory, ignoreUnregisteredUsers } = usePreferences();
  return useMemo(() => ({ roomHistory, ignoreUnregisteredUsers }), [roomHistory, ignoreUnregisteredUsers]);
}

/** Which private messages to show, from the Chat preferences. */
export function usePrivateMessageFilter(): PrivateMessageFilter {
  const { ignoreAllPrivateMessages, ignoreUnregisteredUserMessages, ignoreNonBuddyUserMessages } = usePreferences();
  return useMemo(
    () => ({ ignoreAllPrivateMessages, ignoreUnregisteredUserMessages, ignoreNonBuddyUserMessages }),
    [ignoreAllPrivateMessages, ignoreUnregisteredUserMessages, ignoreNonBuddyUserMessages],
  );
}

export interface ChatHighlights {
  /** For lines from ordinary users. */
  user: ChatHighlight;
  /** For lines from moderators and administrators, whose `@/all` is honoured. */
  moderator: ChatHighlight;
}

/** The reader's mention and alert-word styling, stable until a Chat preference changes. */
export function useChatHighlight(): ChatHighlights {
  const {
    chatMention,
    chatMentionColor,
    chatMentionForeground,
    chatHighlightWords,
    chatHighlightColor,
    chatHighlightForeground,
  } = usePreferences();
  const selfName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? null);

  const users = useAppSelector(server.Selectors.getUsers);

  return useMemo(() => {
    const user: ChatHighlight = {
      selfName,
      userNames: Object.keys(users),
      mentions: chatMention,
      mentionStyle: highlightStyle(chatMentionColor, chatMentionForeground),
      highlightWords: parseHighlightWords(chatHighlightWords),
      highlightStyle: highlightStyle(chatHighlightColor, chatHighlightForeground),
      senderIsModerator: false,
    };
    return { user, moderator: { ...user, senderIsModerator: true } };
  }, [
    selfName,
    users,
    chatMention,
    chatMentionColor,
    chatMentionForeground,
    chatHighlightWords,
    chatHighlightColor,
    chatHighlightForeground,
  ]);
}
