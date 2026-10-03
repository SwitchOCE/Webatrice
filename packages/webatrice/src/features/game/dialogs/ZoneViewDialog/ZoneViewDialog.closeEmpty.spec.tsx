import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { renderWithProviders } from '../../../../__test-utils__';
import { usePreference } from '../../../../hooks/useSettings';
import { useZoneViewDialog } from './useZoneViewDialog';
import ZoneViewDialog from './ZoneViewDialog';

vi.mock('../../../../hooks/useSettings');
vi.mock('./useZoneViewDialog');

const withCards = (cards: ReturnType<typeof makeCard>[]) => {
  vi.mocked(useZoneViewDialog).mockReturnValue({
    cards,
    count: cards.length,
    title: 'Graveyard',
    position: { x: 0, y: 0 },
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
  } as unknown as ReturnType<typeof useZoneViewDialog>);
};

const renderDialog = (handleClose: (shuffle?: boolean) => void, zoneName: string = ZoneName.GRAVE) =>
  renderWithProviders(<ZoneViewDialog isOpen playerId={1} zoneName={zoneName} handleClose={handleClose} />);

describe('ZoneViewDialog — close when the last card is removed', () => {
  it('closes once the last shown card leaves', () => {
    const handleClose = vi.fn();
    withCards([makeCard({ id: 1, name: 'Bolt' })]);
    const { rerender } = renderDialog(handleClose);

    withCards([]);
    rerender(<ZoneViewDialog isOpen playerId={1} zoneName={ZoneName.GRAVE} handleClose={handleClose} />);

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledWith(false);
  });

  it('closes a library view through its shuffle-on-close choice, as closing by hand does', () => {
    const handleClose = vi.fn();
    withCards([makeCard({ id: 1, name: 'Bolt' })]);
    const { rerender } = renderDialog(handleClose, ZoneName.DECK);

    withCards([]);
    rerender(<ZoneViewDialog isOpen playerId={1} zoneName={ZoneName.DECK} handleClose={handleClose} />);

    expect(handleClose).toHaveBeenCalledWith(true);
  });

  it('stays open on a zone that was empty when opened', () => {
    const handleClose = vi.fn();
    withCards([]);
    const { rerender } = renderDialog(handleClose);
    rerender(<ZoneViewDialog isOpen playerId={1} zoneName={ZoneName.GRAVE} handleClose={handleClose} />);

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('stays open when the preference is off', () => {
    vi.mocked(usePreference).mockImplementation(((key: string) => key !== 'closeEmptyCardView') as never);
    const handleClose = vi.fn();
    withCards([makeCard({ id: 1, name: 'Bolt' })]);
    const { rerender } = renderDialog(handleClose);

    withCards([]);
    rerender(<ZoneViewDialog isOpen playerId={1} zoneName={ZoneName.GRAVE} handleClose={handleClose} />);

    expect(handleClose).not.toHaveBeenCalled();
  });
});
