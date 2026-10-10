export interface DockedChat {
  name: string;
  expanded: boolean;
}

export interface ChatDockState {
  chats: readonly DockedChat[];
  focus: { name: string; seq: number } | null;
}

export type ChatDockAction =
  | { type: 'open'; name: string; max: number }
  | { type: 'receive'; name: string }
  | { type: 'expand'; name: string; max: number }
  | { type: 'minimise'; name: string }
  | { type: 'close'; name: string }
  | { type: 'collapseAll' }
  | { type: 'fit'; max: number }
  | { type: 'reset' };

export const EMPTY_CHAT_DOCK: ChatDockState = { chats: [], focus: null };

export const MAX_EXPANDED_CHATS = 3;
const WINDOW_SLOT_PX = 308;
const RESERVED_PX = 480;

export function maxExpandedFor(viewportWidth: number): number {
  const fit = Math.floor((viewportWidth - RESERVED_PX) / WINDOW_SLOT_PX);
  return Math.max(1, Math.min(MAX_EXPANDED_CHATS, fit));
}

function collapseOverflow(chats: DockedChat[], max: number): DockedChat[] {
  let excess = chats.filter((chat) => chat.expanded).length - Math.max(1, max);
  if (excess <= 0) {
    return chats;
  }
  return chats.map((chat) => {
    if (excess > 0 && chat.expanded) {
      excess -= 1;
      return { ...chat, expanded: false };
    }
    return chat;
  });
}

function expandToFront(state: ChatDockState, name: string, max: number): ChatDockState {
  const others = state.chats.filter((chat) => chat.name !== name);
  const chats = collapseOverflow([...others, { name, expanded: true }], max);
  return { chats, focus: { name, seq: (state.focus?.seq ?? 0) + 1 } };
}

export function chatDockReducer(state: ChatDockState, action: ChatDockAction): ChatDockState {
  switch (action.type) {
    case 'open':
    case 'expand':
      return expandToFront(state, action.name, action.max);
    case 'receive':
      if (state.chats.some((chat) => chat.name === action.name)) {
        return state;
      }
      return { ...state, chats: [...state.chats, { name: action.name, expanded: false }] };
    case 'minimise':
      return {
        ...state,
        chats: state.chats.map((chat) => (chat.name === action.name ? { ...chat, expanded: false } : chat)),
      };
    case 'close':
      return {
        chats: state.chats.filter((chat) => chat.name !== action.name),
        focus: state.focus?.name === action.name ? null : state.focus,
      };
    case 'collapseAll':
      return state.chats.some((chat) => chat.expanded)
        ? { ...state, chats: state.chats.map((chat) => ({ ...chat, expanded: false })) }
        : state;
    case 'fit': {
      const chats = collapseOverflow([...state.chats], action.max);
      return chats.every((chat, i) => chat === state.chats[i]) ? state : { ...state, chats };
    }
    case 'reset':
      return EMPTY_CHAT_DOCK;
  }
}

export function expandedChatNames(state: ChatDockState): string[] {
  return state.chats.filter((chat) => chat.expanded).map((chat) => chat.name);
}
