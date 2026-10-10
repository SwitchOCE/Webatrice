import type { DockedChat } from '@app/hooks';

export function splitDock(chats: readonly DockedChat[], selfName: string | null): { windows: DockedChat[]; bars: DockedChat[] } {
  const others = chats.filter((chat) => chat.name !== selfName);
  return {
    windows: others.filter((chat) => chat.expanded),
    bars: others.filter((chat) => !chat.expanded),
  };
}
