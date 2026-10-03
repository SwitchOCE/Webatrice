import { ZoneName } from '@cockatrice/sockatrice';
import { describe, expect, it, vi } from 'vitest';


import { CardDTO } from '../../../services/dexie/DexieDTOs/CardDTO';
import { playCardViaTableRow } from './playCard';

vi.mock('../../../services/dexie/DexieDTOs/CardDTO', () => ({
  CardDTO: { get: vi.fn(() => Promise.resolve(undefined)) },
}));

function makeWebClient() {
  const moveCard = vi.fn();
  return { webClient: { request: { game: { moveCard } } } as never, moveCard };
}

const baseArgs = {
  gameId: 1,
  sourceZone: ZoneName.HAND,
  card: { id: 7, name: 'Bear' } as never,
  faceDown: false,
  isInverted: false,
  tableZone: undefined,
};

describe('playCardViaTableRow — owner routing + judge wrap', () => {
  it('plays an own card onto the local table, sent bare (no judge wrap)', async () => {
    vi.mocked(CardDTO.get).mockResolvedValue({ tablerow: { value: '1' } } as never);
    const { webClient, moveCard } = makeWebClient();

    await playCardViaTableRow({ ...baseArgs, webClient, sourcePlayerId: 1 });

    expect(moveCard).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        startPlayerId: 1,
        targetPlayerId: 1,
        targetZone: ZoneName.TABLE,
      }),
      undefined,
    );
  });

  it('a judge plays a foreign card onto the owner table, wrapped in Command_Judge(target=owner)', async () => {
    vi.mocked(CardDTO.get).mockResolvedValue({ tablerow: { value: '1' } } as never);
    const { webClient, moveCard } = makeWebClient();

    // sourcePlayerId is the card owner; judgeTargetId resolves to the same owner.
    await playCardViaTableRow({ ...baseArgs, webClient, sourcePlayerId: 2, judgeTargetId: 2 });

    expect(moveCard).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        startPlayerId: 2,
        targetPlayerId: 2,
        targetZone: ZoneName.TABLE,
      }),
      2,
    );
  });

  it('routes an instant (tablerow=3) to the owner stack with the judge wrap', async () => {
    vi.mocked(CardDTO.get).mockResolvedValue({ tablerow: { value: '3' } } as never);
    const { webClient, moveCard } = makeWebClient();

    await playCardViaTableRow({ ...baseArgs, webClient, sourcePlayerId: 2, judgeTargetId: 2 });

    expect(moveCard).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        startPlayerId: 2,
        targetPlayerId: 2,
        targetZone: ZoneName.STACK,
      }),
      2,
    );
  });
});

describe('playCardViaTableRow — row placement (card-database policy)', () => {
  // Golden wire rows: the visual row from cardPlacement, inverted once on a mirrored board.
  it.each([
    ['0', false, ZoneName.TABLE, 2],
    ['0', true, ZoneName.TABLE, 0],
    ['1', false, ZoneName.TABLE, 1],
    ['1', true, ZoneName.TABLE, 1],
    ['2', false, ZoneName.TABLE, 0],
    ['2', true, ZoneName.TABLE, 2],
    ['3', true, ZoneName.STACK, 0],
    ['9', false, ZoneName.TABLE, 0],
    ['x', true, ZoneName.TABLE, 2],
    [undefined, false, ZoneName.TABLE, 0],
  ])('tablerow %j (inverted: %s) plays to %s row %i', async (raw, isInverted, zone, y) => {
    vi.mocked(CardDTO.get).mockResolvedValue((raw === undefined ? undefined : { tablerow: { value: raw } }) as never);
    const { webClient, moveCard } = makeWebClient();

    await playCardViaTableRow({ ...baseArgs, isInverted, webClient, sourcePlayerId: 1 });

    expect(moveCard).toHaveBeenCalledWith(1, expect.objectContaining({ targetZone: zone, x: 0, y }), undefined);
  });
});
