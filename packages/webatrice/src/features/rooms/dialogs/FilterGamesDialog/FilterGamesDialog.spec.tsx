import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../__test-utils__';
import { rooms } from '@cockatrice/datatrice';
import FilterGamesDialog from './FilterGamesDialog';

function renderDialog(opts: { gametypeMap?: Record<number, string>; initialFilters?: typeof rooms.DEFAULT_GAME_FILTERS } = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithProviders(
    <FilterGamesDialog
      isOpen
      gametypeMap={opts.gametypeMap ?? {}}
      initialFilters={opts.initialFilters ?? rooms.DEFAULT_GAME_FILTERS}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

describe('FilterGamesDialog', () => {
  it('renders the hide-toggles section', () => {
    renderDialog();
    expect(screen.getByLabelText('FilterGamesDialog.hide.fullGames')).toBeInTheDocument();
    expect(screen.getByLabelText('FilterGamesDialog.hide.gamesThatStarted')).toBeInTheDocument();
    expect(screen.getByLabelText('FilterGamesDialog.hide.passwordProtected')).toBeInTheDocument();
  });

  it('disables spectator sub-filters until "show only if spectators can watch" is checked', () => {
    renderDialog();
    expect(screen.getByLabelText('FilterGamesDialog.spectators.needPassword')).toBeDisabled();
    expect(screen.getByLabelText('FilterGamesDialog.spectators.canChat')).toBeDisabled();
    expect(screen.getByLabelText('FilterGamesDialog.spectators.canSeeHands')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('FilterGamesDialog.spectators.canWatch'));

    expect(screen.getByLabelText('FilterGamesDialog.spectators.needPassword')).not.toBeDisabled();
    expect(screen.getByLabelText('FilterGamesDialog.spectators.canChat')).not.toBeDisabled();
    expect(screen.getByLabelText('FilterGamesDialog.spectators.canSeeHands')).not.toBeDisabled();
  });

  it('Apply submits the unchanged defaults when nothing is edited', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit).toHaveBeenCalledWith(rooms.DEFAULT_GAME_FILTERS);
  });

  it('Apply forwards the toggled hide-full-games filter', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.fullGames'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].hideFullGames).toBe(true);
  });

  it('parses the comma-separated creator names into a trimmed list', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('FilterGamesDialog.label.creatorNames'), { target: { value: 'alice, bob ,carol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit.mock.calls[0][0].creatorNameFilters).toEqual(['alice', 'bob', 'carol']);
  });

  it('renders a checkbox per game type and toggles selection', () => {
    const { onSubmit } = renderDialog({ gametypeMap: { 0: 'Constructed', 1: 'Limited' } });
    fireEvent.click(screen.getByLabelText('Constructed'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit.mock.calls[0][0].gameTypeFilter).toEqual([0]);
  });

  it('Reset restores defaults in the form (Apply submits defaults)', () => {
    const { onSubmit } = renderDialog({
      initialFilters: { ...rooms.DEFAULT_GAME_FILTERS, hideFullGames: true, gameNameFilter: 'foo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit).toHaveBeenCalledWith(rooms.DEFAULT_GAME_FILTERS);
  });

  it('Cancel calls onCancel', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('forwards the gameNameFilter typed into "Game description contains"', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('FilterGamesDialog.label.gameName'), { target: { value: 'casual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit.mock.calls[0][0].gameNameFilter).toBe('casual');
  });

  it('forwards min and max player numeric filters', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('FilterGamesDialog.label.minPlayers'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('FilterGamesDialog.label.maxPlayers'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit.mock.calls[0][0].maxPlayersFilterMin).toBe(2);
    expect(onSubmit.mock.calls[0][0].maxPlayersFilterMax).toBe(6);
  });

  it('forwards the maxGameAgeSeconds when a Max age option is picked', () => {
    const { onSubmit } = renderDialog();
    // Post-MUI: the dialog now uses a native <select>, so switching
    // options is a change event carrying the new value string rather
    // than mouseDown-then-click-option.
    fireEvent.change(screen.getByLabelText('FilterGamesDialog.label.maxAge'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    expect(onSubmit.mock.calls[0][0].maxGameAgeSeconds).toBe(600);
  });

  it('toggles every hide-* checkbox and forwards them on Apply', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.gamesThatStarted'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.passwordProtected'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.buddiesOnly'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.ignoredUsers'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.notBuddyCreated'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.hide.openDecklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.hideGamesThatStarted).toBe(true);
    expect(params.hidePasswordProtectedGames).toBe(true);
    expect(params.hideBuddiesOnlyGames).toBe(true);
    expect(params.hideIgnoredUserGames).toBe(true);
    expect(params.hideNotBuddyCreatedGames).toBe(true);
    expect(params.hideOpenDecklistGames).toBe(true);
  });

  it('toggles every spectator-* sub-filter after enabling "spectators can watch"', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.spectators.canWatch'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.spectators.needPassword'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.spectators.canChat'));
    fireEvent.click(screen.getByLabelText('FilterGamesDialog.spectators.canSeeHands'));
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.apply' }));
    const params = onSubmit.mock.calls[0][0];
    expect(params.showOnlyIfSpectatorsCanWatch).toBe(true);
    expect(params.showSpectatorPasswordProtected).toBe(true);
    expect(params.showOnlyIfSpectatorsCanChat).toBe(true);
    expect(params.showOnlyIfSpectatorsCanSeeHands).toBe(true);
  });
});
