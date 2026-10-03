import { create } from '@bufbuild/protobuf';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Mock } from 'vitest';

import { server } from '@cockatrice/datatrice';
import {
  Response_ReportUserInfoSchema,
  Response_ResponseCode,
  ServerInfo_ModeratorLoginSchema,
  ServerInfo_UserAltSchema,
  ServerInfo_UserSessionSchema,
  ServerInfo_User_UserLevelFlag,
} from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import Moderation from './Moderation';

const { IsRegistered, IsModerator, IsAdmin, IsJudge } = ServerInfo_User_UserLevelFlag;
const MODERATOR = IsRegistered | IsModerator;
const ADMIN = MODERATOR | IsAdmin;

function stateFor(userLevel: number, version = '3.1.0 (2026-01-01)') {
  return {
    ...connectedState,
    server: {
      ...(connectedState.server as any),
      info: { message: null, name: 'Servatrice', version },
      user: makeUser({ name: 'staff', userLevel }),
    },
  };
}

function setup(userLevel = MODERATOR, route = '/moderation', version?: string) {
  const webClient = createMockWebClient();
  const utils = renderWithProviders(
    <Routes>
      <Route path="/server" element={<div>server-page</div>} />
      <Route path="/moderation" element={<Moderation />} />
    </Routes>,
    { preloadedState: stateFor(userLevel, version), route, webClient },
  );
  return { ...utils, webClient };
}

const moderator = (webClient: ReturnType<typeof createMockWebClient>) => webClient.request.moderator as unknown as Record<string, Mock>;

const failed = (
  command: WebsocketTypes.ModeratorCommandName, target: string, responseCode: number, failure?: WebsocketTypes.CommandFailure,
) =>
  server.Actions.moderatorCommandFailed({ command, responseCode, target, failure });

async function investigate(name: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: /search\.placeholder/ }), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /search\.investigate/ }));
  });
}

describe('Moderation gating', () => {
  it('sends a non-moderator away', () => {
    setup(IsRegistered);
    expect(screen.getByText('server-page')).toBeInTheDocument();
  });

  it('is unavailable on a 3.0 server, which has no investigation commands', () => {
    setup(MODERATOR, '/moderation', '3.0.0 ()');
    expect(screen.getByText('server-page')).toBeInTheDocument();
  });

  it('offers Reset Password only to admins (Servatrice serves it in the admin family)', () => {
    setup(MODERATOR);
    expect(screen.queryByRole('button', { name: /action\.resetPassword/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /action\.removeAvatar/ })).toBeDisabled();
  });
});

describe('Moderation investigation', () => {
  it('requests staff last logins on open and lists them', () => {
    const { webClient, store } = setup();
    expect(moderator(webClient).getModeratorLastLogins).toHaveBeenCalledTimes(1);

    act(() => {
      store.dispatch(server.Actions.moderatorLastLogins({
        logins: [create(ServerInfo_ModeratorLoginSchema, { userName: 'boss', userLevel: IsAdmin | IsModerator | IsJudge })],
      }));
    });

    const staff = screen.getByRole('region', { name: /staff\.title/ });
    expect(within(staff).getByText('boss')).toBeInTheDocument();
    expect(within(staff).getByText('ModerationPage.level.admin / ModerationPage.level.moderator / ModerationPage.level.judge'))
      .toBeInTheDocument();
  });

  it('runs the three lookups for a simplified name and shows their results', async () => {
    const { webClient, store } = setup();
    await investigate('  bad   guy ');

    const mod = moderator(webClient);
    expect(mod.reportUserInfo).toHaveBeenCalledWith('bad guy');
    expect(mod.getUserSessions).toHaveBeenCalledWith('bad guy');
    expect(mod.getUserAlts).toHaveBeenCalledWith('bad guy');
    expect(within(screen.getByRole('region', { name: /alts\.title/ })).getByText('ModerationPage.value.loading')).toBeInTheDocument();

    act(() => {
      store.dispatch(server.Actions.userAlts({
        userName: 'bad guy',
        alts: [create(ServerInfo_UserAltSchema, { userName: 'bad guy2', banCount: 3, isActive: true })],
      }));
      store.dispatch(server.Actions.userSessions({
        userName: 'bad guy',
        sessions: [create(ServerInfo_UserSessionSchema, { ipAddress: '10.1.2.3', endTime: 0n, connectionType: 'websocket' })],
      }));
      store.dispatch(server.Actions.userInfoReport({
        info: create(Response_ReportUserInfoSchema, { userName: 'bad guy', isActive: false, totalBans: 3, adminNotes: '' }),
      }));
    });

    const alts = screen.getByRole('region', { name: /alts\.title/ });
    expect(within(alts).getByText('bad guy2')).toBeInTheDocument();
    const sessions = screen.getByRole('region', { name: /sessions\.title/ });
    expect(within(sessions).getByText('10.1.2.3')).toBeInTheDocument();
    expect(within(sessions).getByText('ModerationPage.value.activeSession')).toBeInTheDocument();
    const info = screen.getByRole('region', { name: /info\.title/ });
    expect(within(info).getByText('ModerationPage.info.inactive')).toBeInTheDocument();
    expect(within(info).getByText('ModerationPage.info.noNotes')).toBeInTheDocument();
  });

  it('reports a failed info lookup and leaves the alts table empty on failure', async () => {
    const { webClient, store } = setup();
    await investigate('ghost');
    const mod = moderator(webClient);

    expect(mod.getUserAlts).toHaveBeenCalledWith('ghost');
    act(() => {
      store.dispatch(failed('reportUserInfo', 'ghost', Response_ResponseCode.RespNameNotFound));
      store.dispatch(failed('getUserAlts', 'ghost', Response_ResponseCode.RespInternalError));
    });

    expect(screen.getByText('ModerationPage.info.loadError')).toBeInTheDocument();
    const alts = screen.getByRole('region', { name: /alts\.title/ });
    expect(within(alts).queryByText('ModerationPage.value.loading')).not.toBeInTheDocument();
  });

  it('ignores a late answer for a user no longer investigated', async () => {
    const { store } = setup();
    await investigate('first');
    await investigate('second');

    act(() => {
      store.dispatch(server.Actions.userAlts({ userName: 'first', alts: [create(ServerInfo_UserAltSchema, { userName: 'stale' })] }));
    });

    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /alts\.title/ })).getByText('ModerationPage.value.loading')).toBeInTheDocument();
  });

  it('investigates the user named in the route (useOpenUserInvestigation)', () => {
    const { webClient } = setup(MODERATOR, '/moderation?user=alice');
    expect(moderator(webClient).getUserAlts).toHaveBeenCalledWith('alice');
    expect(screen.getByRole('searchbox', { name: /search\.placeholder/ })).toHaveValue('alice');
  });
});

describe('Moderation remediation', () => {
  it('resets a password after confirmation and shows the temporary password once', async () => {
    const { webClient, store } = setup(ADMIN, '/moderation?user=alice');

    fireEvent.click(screen.getByRole('button', { name: /action\.resetPassword/ }));
    expect(screen.getByText('ModerationPage.confirm.reset')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /button\.ok/ }));

    const reset = webClient.request.admin.resetUserPassword as unknown as Mock;
    expect(reset).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function));
    act(() => reset.mock.calls[0][1]('alice', 's3cr3t-temp'));

    expect(screen.getByText('s3cr3t-temp')).toBeInTheDocument();
    expect(JSON.stringify(store.getState())).not.toContain('s3cr3t-temp');

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /button\.ok/ }));
    expect(screen.queryByText('s3cr3t-temp')).not.toBeInTheDocument();
  });

  it('sends nothing when the reset is cancelled', () => {
    const { webClient } = setup(ADMIN, '/moderation?user=alice');
    fireEvent.click(screen.getByRole('button', { name: /action\.resetPassword/ }));
    fireEvent.click(screen.getByRole('button', { name: /button\.cancel/ }));
    expect(webClient.request.admin.resetUserPassword).not.toHaveBeenCalled();
  });

  it('removes an avatar after confirmation and reports a refusal', () => {
    const { webClient, store } = setup(MODERATOR, '/moderation?user=alice');
    fireEvent.click(screen.getByRole('button', { name: /action\.removeAvatar/ }));
    fireEvent.click(screen.getByRole('button', { name: /button\.ok/ }));

    expect(moderator(webClient).removeUserAvatar).toHaveBeenCalledWith('alice');
    act(() => {
      store.dispatch(failed('removeUserAvatar', 'alice', Response_ResponseCode.RespNameNotFound));
    });
    expect(screen.getByText('ModerationPage.notice.avatarFailed')).toBeInTheDocument();
  });
});

describe('Moderation failures and acknowledgements', () => {
  it('reports a removed avatar once Servatrice acknowledges it', () => {
    const { store } = setup(MODERATOR, '/moderation?user=alice');
    fireEvent.click(screen.getByRole('button', { name: /action\.removeAvatar/ }));
    fireEvent.click(screen.getByRole('button', { name: /button\.ok/ }));
    act(() => {
      store.dispatch(server.Actions.userAvatarRemoved({ userName: 'Alice' }));
    });
    expect(screen.getByText('ModerationPage.notice.avatarRemoved')).toBeInTheDocument();
  });

  it('says why the user info could not load when the server never answered', async () => {
    const { store } = setup();
    await investigate('ghost');
    act(() => {
      store.dispatch(failed('reportUserInfo', 'ghost', Response_ResponseCode.RespNotConnected, WebsocketTypes.CommandFailure.Timeout));
    });
    expect(within(screen.getByRole('region', { name: /info\.title/ })).getByText('CommandFailure.timeout')).toBeInTheDocument();
  });

  it('clears the staff list when its lookup fails', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.moderatorLastLogins({ logins: [create(ServerInfo_ModeratorLoginSchema, { userName: 'boss' })] }));
    });
    expect(screen.getByText('boss')).toBeInTheDocument();
    act(() => {
      store.dispatch(failed('getModeratorLastLogins', '', Response_ResponseCode.RespInternalError));
    });
    expect(screen.queryByText('boss')).not.toBeInTheDocument();
  });

  it('explains a password reset the server never answered', () => {
    const { webClient } = setup(ADMIN, '/moderation?user=alice');
    fireEvent.click(screen.getByRole('button', { name: /action\.resetPassword/ }));
    fireEvent.click(screen.getByRole('button', { name: /button\.ok/ }));
    const reset = webClient.request.admin.resetUserPassword as unknown as Mock;
    act(() => reset.mock.calls[0][2](Response_ResponseCode.RespNotConnected, WebsocketTypes.CommandFailure.Disconnected));
    expect(screen.getByText('CommandFailure.disconnected')).toBeInTheDocument();
  });
});
