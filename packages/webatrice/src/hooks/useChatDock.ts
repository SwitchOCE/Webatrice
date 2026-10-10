import { useCallback, useSyncExternalStore } from 'react';

import {
  chatDockReducer,
  EMPTY_CHAT_DOCK,
  expandedChatNames,
  maxExpandedFor,
  type ChatDockAction,
  type ChatDockState,
} from './chatDockState';

let state: ChatDockState = EMPTY_CHAT_DOCK;
const listeners = new Set<() => void>();

export function dispatchChatDock(action: ChatDockAction): void {
  const next = chatDockReducer(state, action);
  if (next !== state) {
    state = next;
    listeners.forEach((listener) => listener());
  }
}

export function getChatDockState(): ChatDockState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatDockState(): ChatDockState {
  return useSyncExternalStore(subscribe, getChatDockState, getChatDockState);
}

export function getExpandedChats(): string[] {
  return expandedChatNames(state);
}

export function getVisibleChats(): string[] {
  return getExpandedChats();
}

export function currentMaxExpandedChats(): number {
  return maxExpandedFor(typeof window === 'undefined' ? 1440 : window.innerWidth);
}

export function useOpenChat(): (userName: string) => void {
  return useCallback((userName: string) => dispatchChatDock({ type: 'open', name: userName, max: currentMaxExpandedChats() }), []);
}
