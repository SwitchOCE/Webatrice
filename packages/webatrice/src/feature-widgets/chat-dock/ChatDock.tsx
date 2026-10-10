import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { dispatchChatDock, useUnreadCounts } from '@app/hooks';

import ChatBar from './ChatBar';
import ChatWindow from './ChatWindow';
import { focusAfterClose, type DockFocusTarget } from './splitDock';
import { useChatDockController } from './useChatDockController';

export default function ChatDock() {
  const { t } = useTranslation();
  const { visible, windows, bars, bottom, focus } = useChatDockController();
  const unread = useUnreadCounts().chats;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const barButtons = useRef(new Map<string, HTMLButtonElement>());
  const opener = useRef<HTMLElement | null>(null);
  const pending = useRef<DockFocusTarget | null>(null);

  useLayoutEffect(() => {
    const active = document.activeElement;
    if (focus && active instanceof HTMLElement && active !== document.body && !rootRef.current?.contains(active)) {
      opener.current = active;
    }
  }, [focus]);

  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) {
      return;
    }
    pending.current = null;
    if (target === 'opener') {
      if (opener.current?.isConnected) {
        opener.current.focus();
      }
      return;
    }
    (target.kind === 'bar' ? barButtons : inputs).current.get(target.name)?.focus();
  });

  const registerInput = useCallback((name: string, el: HTMLInputElement | null) => {
    if (el) {
      inputs.current.set(name, el);
    } else {
      inputs.current.delete(name);
    }
  }, []);
  const registerBar = useCallback((name: string, el: HTMLButtonElement | null) => {
    if (el) {
      barButtons.current.set(name, el);
    } else {
      barButtons.current.delete(name);
    }
  }, []);
  const minimise = useCallback((name: string) => {
    pending.current = { kind: 'bar', name };
    dispatchChatDock({ type: 'minimise', name });
  }, []);
  const close = useCallback((name: string) => {
    pending.current = focusAfterClose(windows, bars, name);
    dispatchChatDock({ type: 'close', name });
  }, [windows, bars]);

  if (!visible) {
    return null;
  }

  const barGrid = bars.length > 0 && (
    <div className="pointer-events-auto -m-0.5 max-h-[min(30vh,11.5rem)] overflow-y-auto p-0.5">
      <div className="grid grid-cols-2 gap-1.5">
        {bars.map((chat) => (
          <ChatBar
            key={chat.name}
            name={chat.name}
            unread={unread[chat.name] ?? 0}
            registerButton={registerBar}
            onClose={close}
          />
        ))}
      </div>
    </div>
  );
  const style = { '--chat-dock-bottom': bottom } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={t('ChatDock.region')}
      style={style}
      className="pointer-events-none fixed bottom-[var(--chat-dock-bottom)] right-3 z-20 flex items-end gap-2"
    >
      {windows.map((chat, index) => (
        <ChatWindow
          key={chat.name}
          name={chat.name}
          focusSeq={focus?.name === chat.name ? focus.seq : null}
          above={index === windows.length - 1 ? barGrid : undefined}
          registerInput={registerInput}
          onMinimise={minimise}
          onClose={close}
        />
      ))}
      {windows.length === 0 && <div className="mb-3 w-[300px]">{barGrid}</div>}
    </div>
  );
}
