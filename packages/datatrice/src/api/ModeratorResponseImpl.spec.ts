import { create } from '@bufbuild/protobuf';

import { createStore } from '../store/createStore';
import {
  Response_CardArtRuleEntrySchema,
  Response_ReportUserInfoSchema,
  Response_WarnListSchema,
  ServerInfo_BanSchema,
  ServerInfo_ChatMessageSchema,
  ServerInfo_ModeratorLoginSchema,
  ServerInfo_UserAltSchema,
  ServerInfo_UserSessionSchema,
  ServerInfo_WarningSchema,
} from '@cockatrice/sockatrice/generated';
import { Actions as ServerActions } from '../store/server/server.actions';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { ModeratorResponseImpl } from './ModeratorResponseImpl';

function setup() {
  const store = createStore();
  store.dispatch(ServerActions.userInvestigationStarted({ userName: 'alice' }));
  const dispatch = vi.spyOn(store, 'dispatch');
  return { impl: new ModeratorResponseImpl(store), dispatch, store };
}

describe('ModeratorResponseImpl', () => {
  it('banFromServer dispatches the banFromServer action', () => {
    const { impl, dispatch } = setup();
    impl.banFromServer('alice');
    expect(dispatch).toHaveBeenCalledWith(ServerActions.banFromServer({ userName: 'alice' }));
  });

  it('banHistory dispatches the banHistory action with the ban list', () => {
    const { impl, dispatch } = setup();
    const bans = [create(ServerInfo_BanSchema, { adminName: 'admin', reason: 'spam' })];
    impl.banHistory('alice', bans);
    expect(dispatch).toHaveBeenCalledWith(ServerActions.banHistory({ userName: 'alice', banHistory: bans }));
  });

  it('viewLogs dispatches the viewLogs action with the log list', () => {
    const { impl, dispatch } = setup();
    const logs = [create(ServerInfo_ChatMessageSchema, { senderName: 'bob', message: 'hi' })];
    impl.viewLogs(logs);
    expect(dispatch).toHaveBeenCalledWith(ServerActions.viewLogs({ logs }));
  });

  it('warnHistory dispatches the warnHistory action with the warn list', () => {
    const { impl, dispatch } = setup();
    const warnings = [create(ServerInfo_WarningSchema, { adminName: 'admin', reason: 'noise' })];
    impl.warnHistory('alice', warnings);
    expect(dispatch).toHaveBeenCalledWith(ServerActions.warnHistory({ userName: 'alice', warnHistory: warnings }));
  });

  it('warnListOptions dispatches the warnListOptions action with the list', () => {
    const { impl, dispatch } = setup();
    const warnList = [create(Response_WarnListSchema, { warning: 'spam' })];
    impl.warnListOptions(warnList);
    expect(dispatch).toHaveBeenCalledWith(ServerActions.warnListOptions({ warnList }));
  });

  it('warnUser dispatches the warnUser action', () => {
    const { impl, dispatch } = setup();
    impl.warnUser('alice');
    expect(dispatch).toHaveBeenCalledWith(ServerActions.warnUser({ userName: 'alice' }));
  });

  it('grantReplayAccess dispatches the grantReplayAccess action', () => {
    const { impl, dispatch } = setup();
    impl.grantReplayAccess(42, 'mod');
    expect(dispatch).toHaveBeenCalledWith(ServerActions.grantReplayAccess({ replayId: 42, moderatorName: 'mod' }));
  });

  it('forceActivateUser dispatches the forceActivateUser action', () => {
    const { impl, dispatch } = setup();
    impl.forceActivateUser('alice', 'mod');
    expect(dispatch).toHaveBeenCalledWith(
      ServerActions.forceActivateUser({ usernameToActivate: 'alice', moderatorName: 'mod' }),
    );
  });

  it('getAdminNotes dispatches the getAdminNotes action', () => {
    const { impl, dispatch } = setup();
    impl.getAdminNotes('alice', 'notes here');
    expect(dispatch).toHaveBeenCalledWith(ServerActions.getAdminNotes({ userName: 'alice', notes: 'notes here' }));
  });

  it('updateAdminNotes dispatches the updateAdminNotes action', () => {
    const { impl, dispatch } = setup();
    impl.updateAdminNotes('alice', 'updated notes');
    expect(dispatch).toHaveBeenCalledWith(ServerActions.updateAdminNotes({ userName: 'alice', notes: 'updated notes' }));
  });

  it('commandFailed dispatches moderatorCommandFailed with the command, code and target', () => {
    const { impl, dispatch } = setup();
    impl.commandFailed('grantReplayAccess', 13, '42');
    expect(dispatch).toHaveBeenCalledWith(
      ServerActions.moderatorCommandFailed({ command: 'grantReplayAccess', responseCode: 13, target: '42', failure: undefined }),
    );
  });

  it('commandFailed carries the transport reason when the server never answered', () => {
    const { impl, dispatch } = setup();
    impl.commandFailed('viewLogHistory', -1, 'alice', WebsocketTypes.CommandFailure.Disconnected);
    expect(dispatch).toHaveBeenCalledWith(
      ServerActions.moderatorCommandFailed({
        command: 'viewLogHistory', responseCode: -1, target: 'alice', failure: WebsocketTypes.CommandFailure.Disconnected,
      }),
    );
  });

  describe('staff tools', () => {
    it('reportUserInfo dispatches userInfoReport', () => {
      const { impl, dispatch } = setup();
      const info = create(Response_ReportUserInfoSchema, { userName: 'alice' });
      impl.reportUserInfo(info);
      expect(dispatch).toHaveBeenCalledWith(ServerActions.userInfoReport({ info }));
    });

    it('userAlts and userSessions dispatch the lookups keyed by user', () => {
      const { impl, dispatch } = setup();
      const alts = [create(ServerInfo_UserAltSchema, { userName: 'alice2' })];
      const sessions = [create(ServerInfo_UserSessionSchema, { ipAddress: '1.2.3.4' })];
      impl.userAlts('alice', alts);
      impl.userSessions('alice', sessions);
      expect(dispatch).toHaveBeenCalledWith(ServerActions.userAlts({ userName: 'alice', alts }));
      expect(dispatch).toHaveBeenCalledWith(ServerActions.userSessions({ userName: 'alice', sessions }));
    });

    it('moderatorLastLogins and userAvatarRemoved dispatch their actions', () => {
      const { impl, dispatch } = setup();
      const logins = [create(ServerInfo_ModeratorLoginSchema, { userName: 'mod' })];
      impl.moderatorLastLogins(logins);
      impl.userAvatarRemoved('alice');
      expect(dispatch).toHaveBeenCalledWith(ServerActions.moderatorLastLogins({ logins }));
      expect(dispatch).toHaveBeenCalledWith(ServerActions.userAvatarRemoved({ userName: 'alice' }));
    });

    it('card-art rule responses dispatch list, add and remove', () => {
      const { impl, dispatch } = setup();
      const entries = [create(Response_CardArtRuleEntrySchema, { cardName: 'Island' })];
      impl.cardArtRules(entries);
      impl.cardArtRuleAdded('Island', 'p1', 'DENY', 'why');
      impl.cardArtRuleRemoved('Island', 'p1');
      expect(dispatch).toHaveBeenCalledWith(ServerActions.cardArtRules({ entries }));
      expect(dispatch).toHaveBeenCalledWith(
        ServerActions.cardArtRuleAdded({ cardName: 'Island', cardProviderId: 'p1', mode: 'DENY', reason: 'why' }),
      );
      expect(dispatch).toHaveBeenCalledWith(ServerActions.cardArtRuleRemoved({ cardName: 'Island', cardProviderId: 'p1' }));
    });
  });
});

it.each(['info', 'alts', 'sessions'] as const)('drops late %s before it can enter action snapshots', (part) => {
  const { impl, store, dispatch } = setup();
  store.dispatch(ServerActions.userInvestigationStarted({ userName: 'bob' }));
  dispatch.mockClear();
  if (part === 'info') {
    impl.reportUserInfo(create(Response_ReportUserInfoSchema, { userName: 'alice', adminNotes: 'secret' }));
  }
  if (part === 'alts') {
    impl.userAlts('alice', [create(ServerInfo_UserAltSchema, { email: 'secret@example.test' })]);
  }
  if (part === 'sessions') {
    impl.userSessions('alice', [create(ServerInfo_UserSessionSchema, { ipAddress: '192.0.2.7' })]);
  }
  expect(dispatch).not.toHaveBeenCalled();
});
