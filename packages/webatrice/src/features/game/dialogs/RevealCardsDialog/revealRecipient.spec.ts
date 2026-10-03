import { ALL_PLAYERS, revealRecipient } from './revealRecipient';

describe('revealRecipient', () => {
  it('omits player_id for all players', () => {
    expect(revealRecipient(ALL_PLAYERS)).toEqual({});
  });

  it.each([0, 2])('addresses player %i', (playerId) => {
    expect(revealRecipient(playerId)).toEqual({ playerId });
  });
});
