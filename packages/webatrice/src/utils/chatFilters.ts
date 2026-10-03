import {
  Event_RoomSay_RoomMessageType,
  ServerInfo_User_UserLevelFlag,
  type Event_UserMessage,
  type ServerInfo_User,
} from '@cockatrice/sockatrice/generated';

/**
 * Client-side chat filters from desktop's chat preferences. The server delivers these messages;
 * desktop drops them on arrival (tab_room.cpp processRoomSayEvent, tab_supervisor.cpp
 * processUserMessageEvent). The store keeps every message, so the filters run on read, and a
 * verdict cache pins each message to the decision it got when it was first seen.
 */

/**
 * Decisions already taken, keyed by message object. Datatrice never replaces a stored message, so
 * the first verdict sticks: later changes to the sender's presence, level or buddy status, or to
 * the preferences, neither hide a line the reader was shown nor bring back one that was filtered.
 */
export type ChatFilterVerdicts = WeakMap<object, boolean>;

/**
 * The app's verdicts. The alert watchers look at every message as it arrives, so the verdict
 * stored here is the one desktop would have taken.
 */
export const chatFilterVerdicts: ChatFilterVerdicts = new WeakMap();

function decideOnce(verdicts: ChatFilterVerdicts | undefined, message: object, decide: () => boolean): boolean {
  const known = verdicts?.get(message);
  if (known !== undefined) {
    return known;
  }
  const verdict = decide();
  verdicts?.set(message, verdict);
  return verdict;
}

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
 * not sent) carry no sender and always show. With `verdicts`, a line keeps its first verdict.
 */
export function isRoomMessageVisible(
  message: RoomChatLine,
  roomUsers: Readonly<Record<string, ServerInfo_User>>,
  filter: RoomChatFilter,
  verdicts?: ChatFilterVerdicts,
): boolean {
  return decideOnce(verdicts, message, () => decideRoomMessage(message, roomUsers, filter));
}

function decideRoomMessage(
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
 * reader has written to the peer, or a message of theirs got through, the rest follows. With
 * `verdicts`, a message keeps its first verdict.
 */
export function visiblePrivateMessages<T extends Pick<Event_UserMessage, 'senderName'>>(
  messages: readonly T[],
  conversation: PrivateConversation,
  filter: PrivateMessageFilter,
  verdicts?: ChatFilterVerdicts,
): T[] {
  let open = false;
  return messages.filter((message) => {
    const visible = decideOnce(verdicts, message, () => decidePrivateMessage(message, open, conversation, filter));
    open ||= visible;
    return visible;
  });
}

function decidePrivateMessage(
  message: Pick<Event_UserMessage, 'senderName'>,
  open: boolean,
  { selfName, peer, peerIsBuddy }: PrivateConversation,
  filter: PrivateMessageFilter,
): boolean {
  if (message.senderName === selfName) {
    return true;
  }
  const privileged = isPrivilegedUser(peer);
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
  return true;
}
