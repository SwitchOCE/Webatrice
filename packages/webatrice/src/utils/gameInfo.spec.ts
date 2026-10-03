import { create } from '@bufbuild/protobuf';
import type { TFunction } from 'i18next';

import { ServerInfo_GameSchema } from '@cockatrice/sockatrice/generated';

import { formatRestrictions, formatSpectators } from './gameInfo';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

describe('formatRestrictions', () => {
  it('lists every restriction in desktop order', () => {
    const info = create(ServerInfo_GameSchema, {
      withPassword: true,
      onlyBuddies: true,
      onlyRegistered: true,
      shareDecklistsOnLoad: true,
    });
    expect(formatRestrictions(t, info)).toBe(
      'GameInfo.restriction.password, GameInfo.restriction.buddiesOnly, '
      + 'GameInfo.restriction.registeredOnly, GameInfo.restriction.openDecklists',
    );
  });

  it('is empty for an unrestricted game', () => {
    expect(formatRestrictions(t, create(ServerInfo_GameSchema, {}))).toBe('');
  });
});

describe('formatSpectators', () => {
  it('says when spectators are not allowed', () => {
    expect(formatSpectators(t, create(ServerInfo_GameSchema, { spectatorsAllowed: false }))).toBe(
      'GameInfo.spectators.notAllowed',
    );
  });

  it('shows the bare count without flags', () => {
    expect(formatSpectators(t, create(ServerInfo_GameSchema, { spectatorsAllowed: true, spectatorsCount: 3 }))).toBe('3');
  });

  it('adds the chat and see-hands flags to the count', () => {
    const info = create(ServerInfo_GameSchema, {
      spectatorsAllowed: true,
      spectatorsCount: 2,
      spectatorsCanChat: true,
      spectatorsOmniscient: true,
    });
    expect(formatSpectators(t, info)).toBe(
      'GameInfo.spectators.countWithFlags {"count":2,"flags":"GameInfo.spectators.canChat & GameInfo.spectators.seeHands"}',
    );
  });
});
