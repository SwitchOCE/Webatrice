import { create } from '@bufbuild/protobuf';
import { fireEvent, screen } from '@testing-library/react';

import { ServerInfo_PlayerProperties_PlaymatParamsSchema } from '@cockatrice/sockatrice/generated';
import { makeGameEntry, makePlayerEntry, makePlayerProperties } from '@cockatrice/datatrice/testing';
import { connectedState, renderWithProviders } from '../../../../__test-utils__';
import { PlaymatVisibility, setPlaymatSettings, DEFAULT_PLAYMAT_SETTINGS } from '@app/hooks';

import PlayerPlaymat from './PlayerPlaymat';

const island = create(ServerInfo_PlayerProperties_PlaymatParamsSchema, {
  cardName: 'Island',
  cardProviderId: 'uuid-1',
  marginPctL: 0,
  marginPctR: 0,
  verticalOffset: 0,
  zoom: 1,
});

function render({ version = '3.1.0 ()', withPlaymat = true, isSelf = true } = {}) {
  const playmatParams = withPlaymat ? island : undefined;
  const player = makePlayerEntry({ properties: makePlayerProperties({ playerId: 2, playmatParams }) });
  return renderWithProviders(
    <div style={{ position: 'relative' }}>
      <PlayerPlaymat playerId={2} isSelf={isSelf} />
    </div>,
    {
      preloadedState: {
        ...connectedState,
        server: { ...(connectedState.server as any), info: { message: null, name: 'Servatrice', version } },
        games: { games: { 1: makeGameEntry({ players: { 2: player } }) } } as any,
      },
    },
  );
}

const image = () => screen.getByTestId('player-playmat').querySelector('img')!;

describe('PlayerPlaymat', () => {
  afterEach(() => {
    setPlaymatSettings(DEFAULT_PLAYMAT_SETTINGS);
    vi.restoreAllMocks();
  });

  it('loads the announced printing\'s art, hidden until it can be cropped', () => {
    render();
    expect(image()).toHaveAttribute('src', expect.stringContaining('/cards/uuid-1?format=image&version=large'));
    expect(image().style.visibility).toBe('hidden');
  });

  it('cover-fits the crop over the area once the art\'s natural size is known', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    render();
    Object.defineProperty(image(), 'naturalWidth', { value: 600 });
    Object.defineProperty(image(), 'naturalHeight', { value: 900 });
    fireEvent.load(image());

    // The 600px square window at the top of the art, scaled to the 1000px width and centred vertically.
    expect(image().style).toMatchObject({ left: '0px', top: '-350px', width: '1000px', height: '1500px' });
  });

  it('renders nothing without a playmat', () => {
    render({ withPlaymat: false });
    expect(screen.queryByTestId('player-playmat')).not.toBeInTheDocument();
  });

  it('renders nothing on a server without playmats', () => {
    render({ version: '3.0.0 ()' });
    expect(screen.queryByTestId('player-playmat')).not.toBeInTheDocument();
  });

  it('hides every playmat when playmats are turned off', () => {
    setPlaymatSettings({ visibility: PlaymatVisibility.NONE });
    render();
    expect(screen.queryByTestId('player-playmat')).not.toBeInTheDocument();
  });

  it('shows only the local player\'s playmat in own-only mode', () => {
    setPlaymatSettings({ visibility: PlaymatVisibility.OWN_ONLY });
    const { unmount } = render({ isSelf: false });
    expect(screen.queryByTestId('player-playmat')).not.toBeInTheDocument();
    unmount();

    render({ isSelf: true });
    expect(screen.getByTestId('player-playmat')).toBeInTheDocument();
  });
});
