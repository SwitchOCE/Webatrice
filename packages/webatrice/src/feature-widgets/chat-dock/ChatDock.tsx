import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnreadCounts } from '@app/hooks';

import ChatBar from './ChatBar';
import ChatWindow from './ChatWindow';
import { useChatDockController } from './useChatDockController';
import { useDockFocus } from './useDockFocus';

export default function ChatDock() {
  const { t } = useTranslation();
  const { visible, windows, bars, bottom, focus } = useChatDockController();
  const unread = useUnreadCounts().chats;
  const { rootRef, registerInput, registerBar, minimise, close } = useDockFocus(windows, bars, focus);

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
