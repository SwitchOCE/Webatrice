import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnreadCounts } from '@app/hooks';

import ChatBar from './ChatBar';
import ChatWindow from './ChatWindow';
import { useChatDockController } from './useChatDockController';
import { useDockFocus } from './useDockFocus';

export default function ChatDock() {
  const { t } = useTranslation();
  const { visible, windows, bars, rightInset, focus } = useChatDockController();
  const unread = useUnreadCounts().chats;
  const { rootRef, registerInput, registerBar, minimise, close } = useDockFocus(windows, bars, focus);

  if (!visible) {
    return null;
  }

  const style: CSSProperties = {
    right: `calc(${rightInset}px + 0.75rem)`,
    maxWidth: `calc(100vw - ${rightInset}px - 1.5rem)`,
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={t('ChatDock.region')}
      style={style}
      className="pointer-events-none fixed bottom-0 z-20 flex items-end gap-2"
    >
      {bars.length > 0 && (
        <div className="pointer-events-auto flex min-w-0 shrink items-end gap-1.5 overflow-x-auto">
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
      )}
      {windows.map((chat) => (
        <ChatWindow
          key={chat.name}
          name={chat.name}
          focusSeq={focus?.name === chat.name ? focus.seq : null}
          registerInput={registerInput}
          onMinimise={minimise}
          onClose={close}
        />
      ))}
    </div>
  );
}
