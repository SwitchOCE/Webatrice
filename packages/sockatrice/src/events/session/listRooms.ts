import type { Event_ListRooms } from '../../generated';
import { joinRoom } from '../../commands/session';
import { WebClient } from '../../WebClient';

export function listRooms({ roomList }: Event_ListRooms): void {
  WebClient.instance.response.room.updateRooms(roomList);

  if (WebClient.instance.clientOptions.autojoinrooms) {
    roomList.forEach(({ autoJoin, roomId }) => {
      if (autoJoin) {
        // Auto-joins are not user-initiated: desktop joins with setCurrent = false,
        // so a failed auto-join raises no error dialog.
        joinRoom(roomId, false);
      }
    });
  }
}
