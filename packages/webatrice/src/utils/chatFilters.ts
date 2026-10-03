import {
  Event_RoomSay_RoomMessageType,
  ServerInfo_User_UserLevelFlag,
  type Event_UserMessage,
  type ServerInfo_User,
} from '@cockatrice/sockatrice/generated';

/**
 * Client-side chat filters from desktop's chat preferences. The server delivers these messages;
 * desktop drops them on arrival (tab_room.cpp processRoomSayEvent, tab_supervisor.cpp
 * processUserMessageEvent). The store keeps every message, so here they are filtered on read.
 */

const hasFlag = (user: ServerInfo_User | undefined, flag: ServerInfo_User_UserLevelFlag) =>
  user != null && (user.userLevel & flag) === flag;

/** Flags are additive, so moderators and administrators are registered too. */
export const isRegisteredUser = (user: ServerInfo_User | undefined) =>
  hasFlag(user, ServerInfo_User_UserLevelFlag.IsRegistered);

/** Moderators and administrators, whose messages get past the private-message filters. */
export const isPrivilegedUser = (user: ServerInfo_User | undefined) =>
  hasFlag(user, ServerInfo_User_UserLevelFlag.IsModerator) || hasFlag(user, ServerInfo_User_UserLevelFlag.IsAdmin);

/**
 * The preference-driven room filters. Senders on the ignore list never reach the store:
 * Datatrice drops their lines on arrival, as desktop's TabRoom does.
 */
export interface RoomChatFilter {
  /** "Enable room message history on join". */
  roomHistory: boolean;
  /** "Ignore chat room messages sent by unregistered users". */
  ignoreUnregisteredUsers: boolean;
}

export interface RoomChatLine {
  name?: string;
  messageType?: Event_RoomSay_RoomMessageType;
}

/**
 * Whether a room chat line is shown. `roomUsers` is the room's user list: like desktop, the
 * unregistered filter only applies to senders it can look up there. Client notices (flood,
 * not sent) carry no sender and always show.
 */
export function isRoomMessageVisible(
  message: RoomChatLine,
  roomUsers: Readonly<Record<string, ServerInfo_User>>,
  filter: RoomChatFilter,
): boolean {
  if (message.messageType === Event_RoomSay_RoomMessageType.ChatHistory) {
    return filter.roomHistory;
  }
  if (!message.name) {
    return true;
  }
  const sender = roomUsers[message.name];
  return !(filter.ignoreUnregisteredUsers && sender && !isRegisteredUser(sender));
}

export interface PrivateMessageFilter {
  ignoreAllPrivateMessages: boolean;
  ignoreUnregisteredUserMessages: boolean;
  ignoreNonBuddyUserMessages: boolean;
}

export interface PrivateConversation {
  selfName: string | null;
  /** The other party's online user record; undefined while they are offline. */
  peer: ServerInfo_User | undefined;
  peerIsBuddy: boolean;
}

/**
 * The messages of one private conversation the reader gets to see, in order. Mirrors desktop:
 * "ignore all" drops every incoming message unless an online moderator or administrator sent it;
 * the unregistered and non-buddy filters only stop a conversation from opening, so once the
 * reader has written to the peer, or a message of theirs got through, the rest follows.
 */
export function visiblePrivateMessages<T extends Pick<Event_UserMessage, 'senderName'>>(
  messages: readonly T[],
  { selfName, peer, peerIsBuddy }: PrivateConversation,
  filter: PrivateMessageFilter,
): T[] {
  const privileged = isPrivilegedUser(peer);
  let open = false;
  return messages.filter((message) => {
    if (message.senderName === selfName) {
      open = true;
      return true;
    }
    if (filter.ignoreAllPrivateMessages && !privileged) {
      return false;
    }
    if (!open && peer) {
      if (filter.ignoreUnregisteredUserMessages && !isRegisteredUser(peer)) {
        return false;
      }
      if (filter.ignoreNonBuddyUserMessages && !peerIsBuddy && !privileged) {
        return false;
      }
    }
    open = true;
    return true;
  });
}
