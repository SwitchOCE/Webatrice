import { create, toBinary } from '@bufbuild/protobuf';
import { BinaryWriter, WireType } from '@bufbuild/protobuf/wire';

import { ProtobufService, type EventRegistries } from './ProtobufService';
import type { GameExtensionRegistry } from '../events/game';
import type { RoomExtensionRegistry } from '../events/room';
import type { SessionExtensionRegistry } from '../events/session';
import {
  Command_Ping_ext,
  Command_PingSchema,
  Event_GameSay_ext,
  Event_GameSaySchema,
  Event_RoomSay_ext,
  Event_RoomSaySchema,
  Event_ServerMessage_ext,
  Event_ServerMessageSchema,
  GameEventContainerSchema,
  ResponseSchema,
  ServerMessageSchema,
  ServerMessage_MessageType,
} from '../generated';

const NEW_FIELD = 9000;
const NEW_RESPONSE_CODE = 9999;

const newField = () => new BinaryWriter().tag(NEW_FIELD, WireType.Varint).int32(1).finish();

const lengthDelimited = (field: number, value: Uint8Array) =>
  new BinaryWriter().tag(field, WireType.LengthDelimited).bytes(value).finish();

function frame(messageType: number, field?: number, payload?: Uint8Array): MessageEvent {
  const writer = new BinaryWriter().tag(ServerMessageSchema.field.messageType.number, WireType.Varint).int32(messageType);
  if (field !== undefined && payload !== undefined) {
    writer.tag(field, WireType.LengthDelimited).bytes(payload);
  }
  const bytes = writer.finish();
  return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as MessageEvent;
}

const sessionFrame = (event: Uint8Array) =>
  frame(ServerMessage_MessageType.SESSION_EVENT, ServerMessageSchema.field.sessionEvent.number, event);

const roomFrame = (event: Uint8Array) =>
  frame(ServerMessage_MessageType.ROOM_EVENT, ServerMessageSchema.field.roomEvent.number, event);

const serverMessage = () =>
  toBinary(Event_ServerMessageSchema, create(Event_ServerMessageSchema, { message: 'hello' }));

describe('a server newer than this client', () => {
  let session: ReturnType<typeof vi.fn>;
  let room: ReturnType<typeof vi.fn>;
  let game: ReturnType<typeof vi.fn>;
  let service: ProtobufService;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    session = vi.fn();
    room = vi.fn();
    game = vi.fn();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registries: EventRegistries = {
      session: [[Event_ServerMessage_ext, session]] as unknown as SessionExtensionRegistry,
      room: [[Event_RoomSay_ext, room]] as unknown as RoomExtensionRegistry,
      game: [[Event_GameSay_ext, game]] as unknown as GameExtensionRegistry,
    };
    service = new ProtobufService({ isOpen: () => true, send: vi.fn() }, registries);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('skips a session event it has no handler for, then handles the next one', () => {
    service.handleMessageEvent(sessionFrame(newField()));
    expect(session).not.toHaveBeenCalled();

    service.handleMessageEvent(sessionFrame(lengthDelimited(Event_ServerMessage_ext.number, serverMessage())));

    expect(session).toHaveBeenCalledTimes(1);
    expect(session.mock.calls[0][0].message).toBe('hello');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reads the known fields of an event that gained a new field', () => {
    const value = new Uint8Array([...serverMessage(), ...newField()]);

    service.handleMessageEvent(sessionFrame(lengthDelimited(Event_ServerMessage_ext.number, value)));

    expect(session.mock.calls[0][0].message).toBe('hello');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('skips a room event it has no handler for, then handles the next one', () => {
    service.handleMessageEvent(roomFrame(newField()));
    expect(room).not.toHaveBeenCalled();

    const say = toBinary(Event_RoomSaySchema, create(Event_RoomSaySchema, { message: 'hello' }));
    service.handleMessageEvent(roomFrame(lengthDelimited(Event_RoomSay_ext.number, say)));

    expect(room).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('skips an unknown game event and still handles the known one in the same container', () => {
    const say = toBinary(Event_GameSaySchema, create(Event_GameSaySchema, { message: 'hello' }));
    const eventList = GameEventContainerSchema.field.eventList.number;
    const container = new BinaryWriter()
      .tag(eventList, WireType.LengthDelimited).bytes(newField())
      .tag(eventList, WireType.LengthDelimited).bytes(lengthDelimited(Event_GameSay_ext.number, say))
      .finish();

    service.handleMessageEvent(
      frame(ServerMessage_MessageType.GAME_EVENT_CONTAINER, ServerMessageSchema.field.gameEventContainer.number, container),
    );

    expect(game).toHaveBeenCalledTimes(1);
    expect(game.mock.calls[0][0].message).toBe('hello');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('survives a message type it does not know', () => {
    expect(() => service.handleMessageEvent(frame(99))).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('treats a response code it does not know as a failure, not a success', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    service.sendSessionCommand(Command_Ping_ext, create(Command_PingSchema), { onSuccess, onError });

    const response = new BinaryWriter()
      .tag(ResponseSchema.field.cmdId.number, WireType.Varint).uint64(1)
      .tag(ResponseSchema.field.responseCode.number, WireType.Varint).int32(NEW_RESPONSE_CODE)
      .finish();
    service.handleMessageEvent(
      frame(ServerMessage_MessageType.RESPONSE, ServerMessageSchema.field.response.number, response),
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
