import {
  CREATE_GAME_DEFAULTS_KEY,
  initialCreateGameForm,
  readCreateGameDefaults,
  writeCreateGameDefaults,
} from './createGameDefaults';
import { defaultCreateGameForm } from './createGamePresets';

describe('createGameDefaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers by default when nothing is stored or storage is corrupt', () => {
    expect(readCreateGameDefaults()).toEqual({ remember: true });
    window.localStorage.setItem(CREATE_GAME_DEFAULTS_KEY, '{not json');
    expect(readCreateGameDefaults()).toEqual({ remember: true });
  });

  it('round-trips the remembered fields and the format by name, never the password or judge flag', () => {
    const form = { ...defaultCreateGameForm(true), description: 'Pod', password: 'pw', joinAsJudge: true, maxPlayers: 4, gameTypeId: 3 };
    writeCreateGameDefaults(true, form, { 3: 'Commander' });
    const stored = readCreateGameDefaults();
    const restored = initialCreateGameForm(stored, { gametypeMap: { 9: 'Commander' }, isRegistered: true });
    expect(restored).toMatchObject({ description: 'Pod', password: '', joinAsJudge: false, maxPlayers: 4, gameTypeId: 9 });
  });

  it('drops a remembered format the room does not offer', () => {
    writeCreateGameDefaults(true, { ...defaultCreateGameForm(true), gameTypeId: 3 }, { 3: 'Commander' });
    expect(initialCreateGameForm(readCreateGameDefaults(), { gametypeMap: { 1: 'Standard' }, isRegistered: true }).gameTypeId).toBeNull();
  });

  it('starts from the defaults when remembering is off', () => {
    writeCreateGameDefaults(false, { ...defaultCreateGameForm(true), maxPlayers: 6 }, {});
    expect(readCreateGameDefaults()).toEqual({ remember: false, fields: undefined, gameTypeName: null });
    expect(initialCreateGameForm(readCreateGameDefaults(), { gametypeMap: {}, isRegistered: true }).maxPlayers).toBe(2);
  });

  it('clears buddy and registered restrictions for guests', () => {
    writeCreateGameDefaults(true, { ...defaultCreateGameForm(true), onlyBuddies: true }, {});
    expect(initialCreateGameForm(readCreateGameDefaults(), { gametypeMap: {}, isRegistered: false })).toMatchObject({
      onlyBuddies: false,
      onlyRegistered: false,
    });
  });
});
