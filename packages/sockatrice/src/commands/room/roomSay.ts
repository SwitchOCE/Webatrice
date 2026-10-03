import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_RoomSay_ext, Command_RoomSaySchema, Response_ResponseCode } from '../../generated';

export function roomSay(roomId: number, message: string): void {
  const trimmed = message.trim();

  if (!trimmed) {
    return;
  }

  WebClient.instance.protobuf.sendRoomCommand(roomId, Command_RoomSay_ext, create(Command_RoomSaySchema, { message: trimmed }), {
    // Desktop TabRoom::sayFinished handles only the flood rejection; other codes stay silent.
    onResponseCode: {
      [Response_ResponseCode.RespChatFlood]: () => WebClient.instance.response.room.roomSayFlooded(roomId, trimmed),
    },
  });
}
