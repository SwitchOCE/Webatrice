import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, makeStoreState, makeUser } from '../../../../__test-utils__';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import CreateGameDialog from './CreateGameDialog';

function renderDialog(opts: { isJudge?: boolean; isRegistered?: boolean; gametypeMap?: Record<number, string> } = {}) {
  const userLevel =
    (opts.isRegistered ? ServerInfo_User_UserLevelFlag.IsRegistered : 0) |
    (opts.isJudge ? ServerInfo_User_UserLevelFlag.IsJudge : 0);
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <CreateGameDialog
      isOpen
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

describe('CreateGameDialog', () => {
  it('hides the "Create as judge" checkbox for non-judge users', () => {
    renderDialog({ isJudge: false });
    expect(screen.queryByLabelText('CreateGameDialog.label.joinAsJudge')).not.toBeInTheDocument();
  });

  it('shows the "Create as judge" checkbox for judges', () => {
    renderDialog({ isJudge: true });
    expect(screen.getByLabelText('CreateGameDialog.label.joinAsJudge')).toBeInTheDocument();
  });

  it('disables spectator sub-options when "Allow spectators" is unchecked', () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.spectatorsAllowed'));
    expect(screen.getByLabelText('CreateGameDialog.label.spectatorsNeedPassword')).toBeDisabled();
    expect(screen.getByLabelText('CreateGameDialog.label.spectatorsCanTalk')).toBeDisabled();
    expect(screen.getByLabelText('CreateGameDialog.label.spectatorsSeeEverything')).toBeDisabled();
  });

  it('submits desktop-default values for an unedited form', () => {
    const { onSubmit } = renderDialog({ isRegistered: true });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const params = onSubmit.mock.calls[0][0];
    expect(params).toMatchObject({
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

  it('forwards updated description and max players to onSubmit', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.description'), { target: { value: 'Friday Casual' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.maxPlayers'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.description).toBe('Friday Casual');
    expect(params.maxPlayers).toBe(4);
  });

  it('renders a radio per available game type', () => {
    renderDialog({ gametypeMap: { 0: 'Constructed', 1: 'Limited' } });
    expect(screen.getByLabelText('Constructed')).toBeInTheDocument();
    expect(screen.getByLabelText('Limited')).toBeInTheDocument();
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('forwards password and startingLifeTotal text edits', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('CreateGameDialog.label.startingLifeTotal'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.password).toBe('secret');
    expect(params.startingLifeTotal).toBe(30);
  });

  it('forwards the selected game type id when a radio option is picked', () => {
    const { onSubmit } = renderDialog({ gametypeMap: { 0: 'Constructed', 1: 'Limited' } });
    fireEvent.click(screen.getByLabelText('Limited'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    expect(onSubmit.mock.calls[0][0].gameTypeIds).toEqual([1]);
  });

  it('toggles onlyBuddies and onlyRegistered permission checkboxes', () => {
    const { onSubmit } = renderDialog({ isRegistered: true });
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.onlyBuddies'));
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.onlyRegistered'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.onlyBuddies).toBe(true);
    expect(params.onlyRegistered).toBe(false);
  });

  it('toggles every spectator sub-option and forwards them on Create', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.spectatorsNeedPassword'));
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.spectatorsCanTalk'));
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.spectatorsSeeEverything'));
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.joinAsSpectator'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.spectatorsNeedPassword).toBe(true);
    expect(params.spectatorsCanTalk).toBe(true);
    expect(params.spectatorsSeeEverything).toBe(true);
    expect(params.joinAsSpectator).toBe(true);
  });

  it('toggles shareDecklistsOnLoad and joinAsJudge (judge-only)', () => {
    const { onSubmit } = renderDialog({ isJudge: true });
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.shareDecklistsOnLoad'));
    fireEvent.click(screen.getByLabelText('CreateGameDialog.label.joinAsJudge'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.shareDecklistsOnLoad).toBe(true);
    expect(params.joinAsJudge).toBe(true);
  });
});
