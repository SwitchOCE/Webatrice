import type { Event_GameLogNotice } from '../../generated';
import type { GameEventMeta } from '../../types/WebSocketConfig';
import { WebClient } from '../../WebClient';

// Log-only and droppable by contract: consumers ignore notice types they don't know.
export function gameLogNotice(data: Event_GameLogNotice, meta: GameEventMeta): void {
  WebClient.instance.response.game.gameLogNotice?.(meta.gameId, meta.playerId, data.noticeType);
}
