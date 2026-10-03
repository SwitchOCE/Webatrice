import { act, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';

import { server } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import {
  Response_WarnListSchema,
  ServerInfo_BanSchema,
  ServerInfo_User_UserLevelFlag as Flag,
  ServerInfo_WarningSchema,
} from '@cockatrice/sockatrice/generated';

import { connectedState, createMockWebClient, makeUser, renderWithProviders } from '../../__test-utils__';
import { ModerationProvider } from './ModerationProvider';
import type { ModerationAction } from './moderationMenu';
import { REDACT_ALL_MESSAGES } from './useModerationFlow';
import { useModerationMenu } from './useModerationMenu';

const MODERATOR = Flag.IsUser | Flag.IsRegistered | Flag.IsModerator;
const ADMIN = MODERATOR | Flag.IsAdmin;

const Trigger = ({ action, userName = 'alice' }: { action: ModerationAction; userName?: string }) => {
  const { open } = useModerationMenu(userName, Flag.IsUser | Flag.IsRegistered);
  return <button type="button" onClick={() => open(action)}>{`trigger ${action}`}</button>;
};

function setup(action: ModerationAction, localUserLevel = MODERATOR) {
  const webClient = createMockWebClient();
  const self = makeUser({ name: 'mod', userLevel: localUserLevel });
  const preloadedState = {
    ...connectedState,
    server: { ...(connectedState.server as any), user: self },
  };
  const result = renderWithProviders(
    <ModerationProvider>
      <Trigger action={action} />
    </ModerationProvider>,
    { preloadedState, webClient },
  );
  fireEvent.click(screen.getByRole('button', { name: `trigger ${action}` }));
  return { ...result, webClient };
}

const alice = makeUser({ name: 'alice', address: '10.0.0.7', clientid: 'cid-alice', userLevel: Flag.IsRegistered });

describe('ModerationProvider', () => {
  describe('warn user', () => {
    it('fetches user info, then the official warnings, then opens the warning dialog', () => {
      const { store, webClient } = setup('warnUser');
      expect(webClient.request.session.getUserInfo).toHaveBeenCalledWith('alice');
      expect(screen.getByRole('dialog', { name: 'Moderation.common.loading' })).toBeInTheDocument();

      act(() => {
        store.dispatch(server.Actions.getUserInfo({ userInfo: alice }));
      });
      expect(webClient.request.moderator.getWarnList).toHaveBeenCalledWith('mod', 'alice', 'cid-alice');

      act(() => {
        store.dispatch(server.Actions.warnListOptions({
          warnList: [create(Response_WarnListSchema, {
            warning: ['Spamming', 'Flaming', 'Cheating'],
            // 3.1 servers send each reason's starting intervention level; a short list defaults to 1.
            warningIl: [1, 3],
            userName: 'alice',
            userClientid: 'cid-alice',
          })],
        }));
      });
      const dialog = screen.getByRole('dialog', { name: 'Moderation.warn.title' });
      const options = within(dialog).getAllByRole('option');
      // The test i18n returns keys, so a levelled reason shows the suffix key.
      expect(options.map((option) => option.textContent)).toEqual(['', 'Spamming', 'Moderation.warn.withLevel', 'Cheating']);
      expect(options.map((option) => option.getAttribute('value'))).toEqual(['', 'Spamming', 'Flaming', 'Cheating']);
    });

    it('sends Command_WarnUser with the chosen warning, client id and the redact-all amount', async () => {
      const { store, webClient } = setup('warnUser');
      act(() => {
        store.dispatch(server.Actions.getUserInfo({ userInfo: alice }));
      });
      act(() => {
        store.dispatch(server.Actions.warnListOptions({
          warnList: [create(Response_WarnListSchema, { warning: ['Spamming'], userName: 'alice' })],
        }));
      });

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Spamming' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Moderation.common.ok' }));

      await vi.waitFor(() => {
        expect(webClient.request.moderator.warnUser).toHaveBeenCalledWith('alice', 'Spamming', 'cid-alice', REDACT_ALL_MESSAGES);
      });
      expect(screen.queryByRole('dialog', { name: 'Moderation.warn.title' })).not.toBeInTheDocument();
    });

    it('refuses to send without a warning, with desktop\'s message', async () => {
      const { store, webClient } = setup('warnUser');
      act(() => {
        store.dispatch(server.Actions.getUserInfo({ userInfo: alice }));
      });
      act(() => {
        store.dispatch(server.Actions.warnListOptions({
          warnList: [create(Response_WarnListSchema, { warning: ['Spamming'], userName: 'alice' })],
        }));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Moderation.common.ok' }));
      expect(await screen.findByText('Moderation.warn.errorBlankReason')).toBeInTheDocument();
      expect(webClient.request.moderator.warnUser).not.toHaveBeenCalled();
    });
  });

  describe('ban user', () => {
    it('pre-fills name, IP and client id from the user info and sends a 5-minute temporary ban by default', async () => {
      const { store, webClient } = setup('banUser');
      expect(webClient.request.session.getUserInfo).toHaveBeenCalledWith('alice');
      act(() => {
        store.dispatch(server.Actions.getUserInfo({ userInfo: alice }));
      });
      const dialog = screen.getByRole('dialog', { name: 'Moderation.ban.title' });
      expect(within(dialog).getByRole('textbox', { name: 'Moderation.ban.byIp' })).toHaveValue('10.0.0.7');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Moderation.common.ok' }));
      await vi.waitFor(() => {
        expect(webClient.request.moderator.banFromServer).toHaveBeenCalledWith(
          5, 'alice', '10.0.0.7', '', '', 'cid-alice', undefined,
        );
      });
    });
  });

  describe('histories', () => {
    it('shows the ban history table when the server returns bans', () => {
      const { store, webClient } = setup('banHistory');
      expect(webClient.request.moderator.getBanHistory).toHaveBeenCalledWith('alice');
      act(() => {
        store.dispatch(server.Actions.banHistory({
          userName: 'alice',
          banHistory: [create(ServerInfo_BanSchema, { adminName: 'mod', banTime: '2026-01-01', banLength: '60', banReason: 'spam' })],
        }));
      });
      const dialog = screen.getByRole('dialog', { name: 'Moderation.banHistory.title' });
      expect(within(dialog).getByRole('cell', { name: 'spam' })).toBeInTheDocument();
    });

    it('says the user has never been banned for an empty history', () => {
      const { store } = setup('banHistory');
      act(() => {
        store.dispatch(server.Actions.banHistory({ userName: 'alice', banHistory: [] }));
      });
      expect(screen.getByText('Moderation.banHistory.empty')).toBeInTheDocument();
    });

    it('reports a failed ban history request', () => {
      const { store } = setup('banHistory');
      act(() => {
        store.dispatch(server.Actions.moderatorCommandFailed({ command: 'banHistory', responseCode: 3, target: 'alice' }));
      });
      expect(screen.getByText('Moderation.banHistory.failed')).toBeInTheDocument();
    });

    it('explains a ban history request cut off by a disconnect', () => {
      const { store } = setup('banHistory');
      act(() => {
        store.dispatch(server.Actions.moderatorCommandFailed({
          command: 'banHistory', responseCode: -1, target: 'alice', failure: WebsocketTypes.CommandFailure.Disconnected,
        }));
      });
      expect(screen.getByText('Moderation.banHistory.title')).toBeInTheDocument();
      expect(screen.getByText('CommandFailure.disconnected')).toBeInTheDocument();
    });

    it('shows the warn history table with desktop\'s four columns', () => {
      const { store, webClient } = setup('warnHistory');
      expect(webClient.request.moderator.getWarnHistory).toHaveBeenCalledWith('alice');
      act(() => {
        store.dispatch(server.Actions.warnHistory({
          userName: 'alice',
          warnHistory: [create(ServerInfo_WarningSchema, { userName: 'alice', adminName: 'mod', reason: 'Flaming', timeOf: 't' })],
        }));
      });
      const dialog = screen.getByRole('dialog', { name: 'Moderation.warnHistory.title' });
      expect(within(dialog).getAllByRole('columnheader')).toHaveLength(4);
      expect(within(dialog).getByRole('cell', { name: 'Flaming' })).toBeInTheDocument();
    });

    it('says the user has never been warned for an empty history', () => {
      const { store } = setup('warnHistory');
      act(() => {
        store.dispatch(server.Actions.warnHistory({ userName: 'alice', warnHistory: [] }));
      });
      expect(screen.getByText('Moderation.warnHistory.empty')).toBeInTheDocument();
    });
  });

  describe('admin notes', () => {
    it('opens the editor with the stored notes and saves an edit', () => {
      const { store, webClient } = setup('adminNotes');
      expect(webClient.request.moderator.getAdminNotes).toHaveBeenCalledWith('alice');
      act(() => {
        store.dispatch(server.Actions.getAdminNotes({ userName: 'alice', notes: 'watch' }));
      });
      const editor = screen.getByRole('textbox', { name: 'Moderation.adminNotes.title' });
      expect(editor).toHaveValue('watch');
      const update = screen.getByRole('button', { name: 'Moderation.adminNotes.update' });
      expect(update).toBeDisabled();

      fireEvent.change(editor, { target: { value: 'watch closely' } });
      expect(update).toBeEnabled();
      fireEvent.click(update);
      return vi.waitFor(() => {
        expect(webClient.request.moderator.updateAdminNotes).toHaveBeenCalledWith('alice', 'watch closely');
      });
    });

    it('reports a failed notes lookup', () => {
      const { store } = setup('adminNotes');
      act(() => {
        store.dispatch(server.Actions.moderatorCommandFailed({ command: 'getAdminNotes', responseCode: 6, target: 'alice' }));
      });
      expect(screen.getByText('Moderation.adminNotes.failed')).toBeInTheDocument();
    });
  });

  describe('role changes', () => {
    it('sends only should_be_mod for a promotion and reports success', () => {
      const { store, webClient } = setup('promoteMod', ADMIN);
      expect(webClient.request.admin.adjustMod).toHaveBeenCalledWith('alice', true, undefined, undefined);
      act(() => {
        store.dispatch(server.Actions.adjustMod({ userName: 'alice', shouldBeMod: true }));
      });
      expect(screen.getByText('Moderation.adjustMod.promoted')).toBeInTheDocument();
    });

    it('sends only should_be_developer for a developer promotion', () => {
      const { webClient } = setup('promoteDeveloper', ADMIN);
      expect(webClient.request.admin.adjustMod).toHaveBeenCalledWith('alice', undefined, undefined, true);
    });

    it('sends only should_be_judge for a demotion and reports failure', () => {
      const { store, webClient } = setup('demoteJudge', ADMIN);
      expect(webClient.request.admin.adjustMod).toHaveBeenCalledWith('alice', undefined, false, undefined);
      act(() => {
        store.dispatch(server.Actions.adminCommandFailed({ command: 'adjustMod', responseCode: 3, target: 'alice' }));
      });
      expect(screen.getByText('Moderation.adjustMod.demoteFailed')).toBeInTheDocument();
    });
  });
});

describe('investigate user', () => {
  it('opens the Moderation page on the user, as desktop openTabModeration(userName)', () => {
    const LocationProbe = () => {
      const location = useLocation();
      return <span data-testid="location">{location.pathname + location.search}</span>;
    };
    const webClient = createMockWebClient();
    renderWithProviders(
      <ModerationProvider>
        <Trigger action="investigateUser" />
        <LocationProbe />
      </ModerationProvider>,
      {
        preloadedState: {
          ...connectedState,
          server: { ...(connectedState.server as any), user: makeUser({ name: 'mod', userLevel: MODERATOR }) },
        },
        webClient,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger investigateUser' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/moderation?user=alice');
  });
});
