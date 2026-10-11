import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import {
  currentMaxExpandedChats,
  dispatchChatDock,
  getPreferencesSnapshot,
  useActionFeed,
  useChatDockState,
  type DockedChat,
} from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { incomingChatPeer } from './incomingChat';
import { splitDock } from './splitDock';

export const DOCK_AVOID_ATTRIBUTE = 'data-chat-dock-avoid';

function findAvoided(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${DOCK_AVOID_ATTRIBUTE}]`);
}

export function rightInset(el: HTMLElement | null, viewportWidth = window.innerWidth): number {
  if (!el) {
    return 0;
  }
  return Math.max(0, Math.round(viewportWidth - el.getBoundingClientRect().left));
}

export function watchDockInset(onChange: (inset: number) => void, root: HTMLElement = document.body): () => void {
  let avoided: HTMLElement | null = null;
  let resize: ResizeObserver | null = null;
  const report = () => onChange(rightInset(avoided));
  const attach = (next: HTMLElement | null) => {
    if (next === avoided) {
      return;
    }
    avoided = next;
    resize?.disconnect();
    if (avoided && typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(report);
      resize.observe(avoided);
    }
    report();
  };
  const finder = new MutationObserver(() => {
    if (!avoided?.isConnected) {
      attach(findAvoided(root));
    }
  });
  finder.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', report);
  attach(findAvoided(root));
  if (!avoided) {
    report();
  }
  return () => {
    finder.disconnect();
    resize?.disconnect();
    window.removeEventListener('resize', report);
  };
}

function useDockInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    if (!active) {
      setInset(0);
      return undefined;
    }
    return watchDockInset(setInset);
  }, [active]);
  return inset;
}

export interface ChatDockView {
  visible: boolean;
  windows: DockedChat[];
  bars: DockedChat[];
  rightInset: number;
  focus: { name: string; seq: number } | null;
}

export function useChatDockController(): ChatDockView {
  const selfName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? null);
  const dock = useChatDockState();
  const { pathname } = useLocation();
  const gameId = matchPath({ path: RouteEnum.GAME, end: true }, pathname)?.params.gameId ?? null;
  const onPopup = matchPath({ path: RouteEnum.CARD_PREVIEW_POPUP, end: true }, pathname) !== null;

  const sessionUser = useRef(selfName);
  useEffect(() => {
    if (sessionUser.current !== selfName) {
      sessionUser.current = selfName;
      dispatchChatDock({ type: 'reset' });
    }
  }, [selfName]);
  useEffect(() => () => dispatchChatDock({ type: 'reset' }), []);

  useEffect(() => {
    const onResize = () => dispatchChatDock({ type: 'fit', max: currentMaxExpandedChats() });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (gameId !== null) {
      dispatchChatDock({ type: 'collapseAll' });
    }
  }, [gameId]);

  useActionFeed((action, _before, after) => {
    const peer = incomingChatPeer(action, after, getPreferencesSnapshot());
    if (peer) {
      dispatchChatDock({ type: 'receive', name: peer });
    }
  });

  const { windows, bars } = useMemo(() => splitDock(dock.chats, selfName), [dock.chats, selfName]);
  const inset = useDockInset(gameId !== null && windows.length + bars.length > 0);

  return {
    visible: Boolean(selfName) && !onPopup && windows.length + bars.length > 0,
    windows,
    bars,
    rightInset: inset,
    focus: dock.focus,
  };
}
