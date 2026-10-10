import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnreadCounts } from '@app/hooks';

import ChatBar from './ChatBar';
import ChatWindow from './ChatWindow';
import { useChatDockController } from './useChatDockController';

export default function ChatDock() {
  const { t } = useTranslation();
  const { visible, windows, bars, bottom, focus } = useChatDockController();
  const unread = useUnreadCounts().chats;

  if (!visible) {
    return null;
  }

  const barGrid = bars.length > 0 && (
    <div className="grid grid-cols-2 gap-1.5">
      {bars.map((chat) => (
        <ChatBar key={chat.name} name={chat.name} unread={unread[chat.name] ?? 0} />
      ))}
    </div>
  );
  const last = windows.at(-1);
  const style = { '--chat-dock-bottom': bottom } as CSSProperties;

  return (
    <div
      role="region"
      aria-label={t('ChatDock.region')}
      style={style}
      className="pointer-events-none fixed bottom-[var(--chat-dock-bottom)] right-3 z-30 flex items-end gap-2"
    >
      {windows.slice(0, -1).map((chat) => (
        <ChatWindow key={chat.name} name={chat.name} focusSeq={focus?.name === chat.name ? focus.seq : null} />
      ))}
      {last ? (
        <ChatWindow
          key={last.name}
          name={last.name}
          focusSeq={focus?.name === last.name ? focus.seq : null}
          above={barGrid}
        />
      ) : (
        <div className="mb-3 w-[300px]">{barGrid}</div>
      )}
    </div>
  );
}
