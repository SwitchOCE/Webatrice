import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, makeStoreState, makeUser } from '../../../../__test-utils__';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import CreateGameDialog from './CreateGameDialog';
import { CREATE_GAME_DEFAULTS_KEY } from './createGameDefaults';

function renderDialog(opts: { isJudge?: boolean; isRegistered?: boolean; gametypeMap?: Record<number, string> } = {}) {
  const userLevel =
    (opts.isRegistered ? ServerInfo_User_UserLevelFlag.IsRegistered : 0) |
    (opts.isJudge ? ServerInfo_User_UserLevelFlag.IsJudge : 0);
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <CreateGameDialog
      isOpen
      roomName="Magic"
      gametypeMap={opts.gametypeMap ?? {}}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
    {
      preloadedState: makeStoreState({
        server: {
          user: makeUser({ userLevel }),
        } as any,
      }),
    },
  );
  return { onSubmit, onCancel };
}

const create = () => fireEvent.click(screen.getByRole('button', { name: 'CreateGameDialog.action.create' }));
const openAdvanced = () => fireEvent.click(screen.getByRole('button', { name: /CreateGameDialog.advanced.title/ }));
const toggle = (key: string) => fireEvent.click(screen.getByRole('switch', { name: `CreateGameDialog.label.${key}` }));
const preset = (id: string) => screen.getByRole('radio', { name: `CreateGameDialog.preset.${id}.name` });

describe('CreateGameDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('submits desktop-default values for an unedited form, with the 1v1 preset selected', () => {
    const { onSubmit } = renderDialog({ isRegistered: true });
    expect(preset('oneVsOne')).toBeChecked();
    create();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      description: '',
      password: '',
      maxPlayers: 2,
      onlyBuddies: false,
      onlyRegistered: true,
      spectatorsAllowed: true,
      spectatorsNeedPassword: false,
      spectatorsCanTalk: false,
      spectatorsSeeEverything: false,
      joinAsSpectator: false,
      startingLifeTotal: 20,
      shareDecklistsOnLoad: false,
      joinAsJudge: false,
      gameTypeIds: [],
    });
  });

  it('Commander pod sets four seats, 40 life and the room\'s Commander type', () => {
    const { onSubmit } = renderDialog({ isRegistered: true, gametypeMap: { 0: 'Standard', 3: 'Commander' } });
    fireEvent.click(preset('commanderPod'));
    expect(preset('commanderPod')).toBeChecked();
    create();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ maxPlayers: 4, startingLifeTotal: 40, gameTypeIds: [3] });
  });

  it('Commander pod leaves the format as Any when the room has no Commander type', () => {
    const { onSubmit } = renderDialog({ isRegistered: true, gametypeMap: { 0: 'Standard' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.format'), { target: { value: '0' } });
    fireEvent.click(preset('commanderPod'));
    create();
    expect(onSubmit.mock.calls[0][0].gameTypeIds).toEqual([]);
  });

  it('Friends only is unavailable to unregistered users', () => {
    renderDialog({ isRegistered: false });
    expect(preset('friendsOnly')).toBeDisabled();
  });

  it('deselects the preset once a field no longer matches it', () => {
    renderDialog({ isRegistered: true });
    openAdvanced();
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.maxPlayers'), { target: { value: '3' } });
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  });

  it('keeps every field under Advanced, collapsed by default', () => {
    renderDialog({ isRegistered: true });
    expect(screen.queryByRole('switch', { name: 'CreateGameDialog.label.spectatorsAllowed' })).not.toBeInTheDocument();
    openAdvanced();
    expect(screen.getByRole('button', { name: /CreateGameDialog.advanced.title/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('switch', { name: 'CreateGameDialog.label.spectatorsAllowed' })).toBeInTheDocument();
  });

  it('hides "Join as judge" for non-judges', () => {
    renderDialog({ isJudge: false });
    openAdvanced();
    expect(screen.queryByRole('switch', { name: 'CreateGameDialog.label.joinAsJudge' })).not.toBeInTheDocument();
  });

  it('disables spectator sub-options when watching is off', () => {
    renderDialog();
    openAdvanced();
    toggle('spectatorsAllowed');
    expect(screen.getByRole('switch', { name: 'CreateGameDialog.label.spectatorsNeedPassword' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'CreateGameDialog.label.spectatorsCanTalk' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'CreateGameDialog.label.spectatorsSeeEverything' })).toBeDisabled();
  });

  it('forwards description, password, seats, life and format edits', () => {
    const { onSubmit } = renderDialog({ gametypeMap: { 0: 'Constructed', 1: 'Limited' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.description'), { target: { value: 'Friday Casual' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.format'), { target: { value: '1' } });
    openAdvanced();
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.maxPlayers'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.startingLifeTotal'), { target: { value: '30' } });
    create();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      description: 'Friday Casual',
      password: 'secret',
      maxPlayers: 4,
      startingLifeTotal: 30,
      gameTypeIds: [1],
    });
  });

  it('toggles every Advanced switch and forwards them on Create', () => {
    const { onSubmit } = renderDialog({ isRegistered: true, isJudge: true });
    openAdvanced();
    ['onlyBuddies', 'onlyRegistered', 'shareDecklistsOnLoad', 'joinAsSpectator', 'joinAsJudge',
      'spectatorsCanTalk', 'spectatorsSeeEverything', 'spectatorsNeedPassword'].forEach(toggle);
    create();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      onlyBuddies: true,
      onlyRegistered: false,
      shareDecklistsOnLoad: true,
      joinAsSpectator: true,
      joinAsJudge: true,
      spectatorsCanTalk: true,
      spectatorsSeeEverything: true,
      spectatorsNeedPassword: true,
    });
  });

  it('remembers the settings for next time, without the password', () => {
    const { onSubmit } = renderDialog({ isRegistered: true, gametypeMap: { 3: 'Commander' } });
    fireEvent.click(preset('commanderPod'));
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.password'), { target: { value: 'secret' } });
    create();
    expect(onSubmit).toHaveBeenCalled();
    const stored = JSON.parse(window.localStorage.getItem(CREATE_GAME_DEFAULTS_KEY) ?? '{}');
    expect(stored).toMatchObject({ remember: true, gameTypeName: 'Commander', fields: { maxPlayers: 4 } });
    expect(JSON.stringify(stored)).not.toContain('secret');
  });

  it('opens on the remembered preset', () => {
    window.localStorage.setItem(CREATE_GAME_DEFAULTS_KEY, JSON.stringify({
      remember: true,
      gameTypeName: 'Commander',
      fields: {
        description: 'Pod night',
        maxPlayers: 4,
        startingLifeTotal: 40,
        onlyBuddies: false,
        onlyRegistered: true,
        spectatorsAllowed: true,
        spectatorsNeedPassword: false,
        spectatorsCanTalk: false,
        spectatorsSeeEverything: false,
        joinAsSpectator: false,
        shareDecklistsOnLoad: false,
      },
    }));
    renderDialog({ isRegistered: true, gametypeMap: { 3: 'Commander' } });
    expect(preset('commanderPod')).toBeChecked();
    expect(screen.getByLabelText('CreateGameDialog.label.description')).toHaveValue('Pod night');
    expect(screen.getByLabelText('CreateGameDialog.label.format')).toHaveValue('3');
  });

  it('forgets the settings when "Remember as my default" is off', () => {
    renderDialog({ isRegistered: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'CreateGameDialog.label.remember' }));
    create();
    expect(JSON.parse(window.localStorage.getItem(CREATE_GAME_DEFAULTS_KEY) ?? '{}')).toEqual({ remember: false });
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
