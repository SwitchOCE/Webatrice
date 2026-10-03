import { act, fireEvent, screen } from '@testing-library/react';

import { server } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';

import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import ModeratorFunctions from './ModeratorFunctions';

function setup() {
  const webClient = createMockWebClient();
  const preloadedState = {
    ...connectedState,
    server: { ...(connectedState.server as any), user: makeUser({ name: 'mod' }) },
  };
  return { ...renderWithProviders(<ModeratorFunctions />, { preloadedState, webClient }), webClient };
}

async function submit(field: string, value: string, button: string) {
  fireEvent.change(screen.getByRole('textbox', { name: field }), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: button }));
  });
}

const grant = (value: string) => submit('Moderation.functions.replayId', value, 'Moderation.functions.grantReplayAccess');
const activate = (value: string) => submit('Moderation.functions.userToActivate', value, 'Moderation.functions.forceActivate');

describe('ModeratorFunctions', () => {
  it('keeps each button disabled until its field has text', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Moderation.functions.grantReplayAccess' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Moderation.functions.forceActivate' })).toBeDisabled();
  });

  it('accepts digits only in the replay id', () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Moderation.functions.replayId' }), { target: { value: '4a2' } });
    expect(screen.getByRole('textbox', { name: 'Moderation.functions.replayId' })).toHaveValue('42');
  });

  it('grants replay access as the local moderator', async () => {
    const { webClient, store } = setup();
    await grant('42');
    expect(webClient.request.moderator.grantReplayAccess).toHaveBeenCalledWith(42, 'mod');

    act(() => {
      store.dispatch(server.Actions.grantReplayAccess({ replayId: 42, moderatorName: 'mod' }));
    });
    expect(screen.getByText('Moderation.functions.replayGranted')).toBeInTheDocument();
    expect(webClient.request.session.replayList).toHaveBeenCalled();
  });

  it.each([
    [Response_ResponseCode.RespContextError, 'Moderation.functions.replayInvalid'],
    [Response_ResponseCode.RespInternalError, 'Moderation.functions.replayError'],
  ])('maps a grant failure with code %s to desktop\'s message', async (responseCode, message) => {
    const { store } = setup();
    await grant('9');
    act(() => {
      store.dispatch(server.Actions.moderatorCommandFailed({ command: 'grantReplayAccess', responseCode, target: '9' }));
    });
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('force-activates the trimmed user name', async () => {
    const { webClient, store } = setup();
    await activate('  sleeper ');
    expect(webClient.request.moderator.forceActivateUser).toHaveBeenCalledWith('sleeper', 'mod');

    act(() => {
      store.dispatch(server.Actions.forceActivateUser({ usernameToActivate: 'sleeper', moderatorName: 'mod' }));
    });
    expect(screen.getByText('Moderation.functions.activated')).toBeInTheDocument();
  });

  it.each([
    [Response_ResponseCode.RespNameNotFound, 'Moderation.functions.activateUnknown'],
    [Response_ResponseCode.RespActivationFailed, 'Moderation.functions.activateAlreadyActive'],
    [Response_ResponseCode.RespInternalError, 'Moderation.functions.activateError'],
  ])('maps an activation failure with code %s to desktop\'s message', async (responseCode, message) => {
    const { store } = setup();
    await activate('sleeper');
    act(() => {
      store.dispatch(server.Actions.moderatorCommandFailed({ command: 'forceActivateUser', responseCode, target: 'sleeper' }));
    });
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('ignores outcomes of requests it did not send', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.grantReplayAccess({ replayId: 1, moderatorName: 'someone' }));
    });
    expect(screen.queryByText('Moderation.functions.replayGranted')).not.toBeInTheDocument();
  });
});
