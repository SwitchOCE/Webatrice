vi.mock('../../WebClient');
import { create } from '@bufbuild/protobuf';
import {
  Event_GameLogNotice_NoticeType,
  Event_GameLogNoticeSchema,
  Event_GameStateChangedSchema,
  ServerInfo_PlayerPropertiesSchema,
} from '../../generated';
import { WebClient } from '../../WebClient';
import { gameLogNotice } from './gameLogNotice';
import { gameStateChanged } from './gameStateChanged';
import { playerPropertiesChanged } from './playerPropertiesChanged';

const meta = { gameId: 5, playerId: 2, context: null, secondsElapsed: 0, forcedByJudge: 0 };

describe('gameStateChanged event', () => {
  it('delegates to WebClient.instance.response.game.gameStateChanged with gameId and full data', () => {
    const data = create(Event_GameStateChangedSchema, { playerList: [] });
    gameStateChanged(data, meta);
    expect(WebClient.instance.response.game.gameStateChanged).toHaveBeenCalledWith(5, data);
  });

  it('forwards an empty Event_GameStateChanged payload without crashing', () => {
    const data = create(Event_GameStateChangedSchema, {});
    gameStateChanged(data, meta);
    expect(WebClient.instance.response.game.gameStateChanged).toHaveBeenCalledWith(5, data);
  });

  it('preserves a negative gameId in meta (malformed but still forwarded)', () => {
    const data = create(Event_GameStateChangedSchema, { playerList: [] });
    const badMeta = { ...meta, gameId: -1 };
    gameStateChanged(data, badMeta);
    expect(WebClient.instance.response.game.gameStateChanged).toHaveBeenCalledWith(-1, data);
  });
});

describe('playerPropertiesChanged event', () => {
  it('delegates to WebClient.instance.response.game.playerPropertiesChanged with gameId, playerId, properties', () => {
    const playerProperties = create(ServerInfo_PlayerPropertiesSchema, { playerId: 2 });
    const data = { playerProperties };
    playerPropertiesChanged(data, meta);
    expect(WebClient.instance.response.game.playerPropertiesChanged).toHaveBeenCalledWith(5, 2, playerProperties);
  });

  it('forwards undefined playerProperties when payload is malformed', () => {
    const data = { playerProperties: undefined as unknown as ReturnType<typeof create<typeof ServerInfo_PlayerPropertiesSchema>> };
    playerPropertiesChanged(data, meta);
    expect(WebClient.instance.response.game.playerPropertiesChanged).toHaveBeenCalledWith(5, 2, undefined);
  });
});

describe('gameLogNotice event', () => {
  it('forwards the notice type with the game and acting player', () => {
    const data = create(Event_GameLogNoticeSchema, { noticeType: Event_GameLogNotice_NoticeType.UNDO_DRAW_FAILED });
    gameLogNotice(data, meta);
    expect(WebClient.instance.response.game.gameLogNotice).toHaveBeenCalledWith(5, 2, Event_GameLogNotice_NoticeType.UNDO_DRAW_FAILED);
  });

  it('forwards notice types newer than this client unchanged (consumers drop unknown ones)', () => {
    const data = create(Event_GameLogNoticeSchema, { noticeType: 99 as Event_GameLogNotice_NoticeType });
    gameLogNotice(data, meta);
    expect(WebClient.instance.response.game.gameLogNotice).toHaveBeenCalledWith(5, 2, 99);
  });
});
