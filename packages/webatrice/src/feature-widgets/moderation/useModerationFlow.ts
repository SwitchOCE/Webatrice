import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Response_WarnList, ServerInfo_Ban, ServerInfo_User, ServerInfo_Warning } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';

import type { ModerationAction } from './moderationMenu';
import { banMinutes, type BanUserFormValues, type WarnUserFormValues } from './moderationFormSchemas';

/**
 * Command_WarnUser / Command_BanFromServer `remove_messages` value for "redact
 * every message". Desktop sets -1 on the uint32 field, which goes on the wire as
 * 0xFFFFFFFF and which Servatrice reads back into an int as -1 ("all").
 */
export const REDACT_ALL_MESSAGES = 0xffffffff;

type Stage = 'loading' | 'ready';

/**
 * The dialog flow in progress. Each one mirrors a desktop round trip:
 *  - warnUser: GetUserInfo → GetWarnList(name, clientid) → WarningDialog
 *  - banUser: GetUserInfo → BanDialog (pre-filled with address / clientid)
 *  - warnHistory / banHistory / adminNotes: one moderator command → table or editor
 */
export type ModerationFlow =
  | { kind: 'warnUser'; userName: string; stage: Stage; clientId: string | null }
  | { kind: 'banUser'; userName: string; stage: Stage }
  | { kind: 'warnHistory' | 'banHistory' | 'adminNotes'; userName: string; stage: Stage };

export interface ModerationNotice {
  title: string;
  message: string;
  severity: 'info' | 'error';
}

export interface ModerationFlowState {
  flow: ModerationFlow | null;
  notice: ModerationNotice | null;
  userInfo: ServerInfo_User | undefined;
  warnList: Response_WarnList | undefined;
  banHistory: ServerInfo_Ban[] | undefined;
  warnHistory: ServerInfo_Warning[] | undefined;
  adminNotes: string | undefined;
  open: (action: ModerationAction, userName: string) => void;
  close: () => void;
  dismissNotice: () => void;
  submitWarn: (values: WarnUserFormValues) => void;
  submitBan: (values: BanUserFormValues) => void;
  submitAdminNotes: (notes: string) => void;
}

interface UserNamePayload { userName: string }
interface FailedPayload { command: string; responseCode: number; target: string; failure?: WebsocketTypes.CommandFailure }

/**
 * Drives desktop's UserContextMenu moderator round trips (user_context_menu.cpp)
 * for every user surface: sends the commands, waits for the matching Datatrice
 * signal, then opens the dialog — or the message box desktop shows instead.
 */
export function useModerationFlow(): ModerationFlowState {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const webClient = useWebClient();
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? '');
  const [flow, setFlow] = useState<ModerationFlow | null>(null);
  const [notice, setNotice] = useState<ModerationNotice | null>(null);
  // Role changes have no dialog: remember which way each pending one went so the
  // outcome box can say promoted / demoted (adjustMod_processUserResponse).
  const pendingRoleChanges = useRef(new Map<string, boolean>());

  const target = flow?.userName ?? '';
  const userInfo = useAppSelector((state) => (target ? server.Selectors.getUserInfoByName(state, target) : undefined));
  const warnList = useAppSelector((state) => (target ? server.Selectors.getWarnListForUser(state, target) : undefined));
  const banHistory = useAppSelector((state) => (target ? server.Selectors.getBanHistoryByUser(state, target) : undefined));
  const warnHistory = useAppSelector((state) => (target ? server.Selectors.getWarnHistoryByUser(state, target) : undefined));
  const adminNotes = useAppSelector((state) => (target ? server.Selectors.getAdminNotesByUser(state, target) : undefined));

  const close = useCallback(() => setFlow(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  // Desktop sends only the flag of the role being changed (execAdjustMod /
  // execAdjustJudge / execAdjustDeveloper); the others stay unset.
  const changeRole = useCallback((
    userName: string,
    change: { shouldBeMod?: boolean; shouldBeJudge?: boolean; shouldBeDeveloper?: boolean },
  ) => {
    pendingRoleChanges.current.set(userName, Boolean(change.shouldBeMod || change.shouldBeJudge || change.shouldBeDeveloper));
    webClient.request.admin.adjustMod(userName, change.shouldBeMod, change.shouldBeJudge, change.shouldBeDeveloper);
  }, [webClient]);

  const open = useCallback((action: ModerationAction, userName: string) => {
    switch (action) {
      case 'warnUser':
        setFlow({ kind: 'warnUser', userName, stage: 'loading', clientId: null });
        webClient.request.session.getUserInfo(userName);
        break;
      case 'banUser':
        setFlow({ kind: 'banUser', userName, stage: 'loading' });
        webClient.request.session.getUserInfo(userName);
        break;
      case 'warnHistory':
        setFlow({ kind: 'warnHistory', userName, stage: 'loading' });
        webClient.request.moderator.getWarnHistory(userName);
        break;
      case 'banHistory':
        setFlow({ kind: 'banHistory', userName, stage: 'loading' });
        webClient.request.moderator.getBanHistory(userName);
        break;
      case 'adminNotes':
        setFlow({ kind: 'adminNotes', userName, stage: 'loading' });
        webClient.request.moderator.getAdminNotes(userName);
        break;
      case 'promoteMod':
      case 'demoteMod':
        changeRole(userName, { shouldBeMod: action === 'promoteMod' });
        break;
      case 'promoteJudge':
      case 'demoteJudge':
        changeRole(userName, { shouldBeJudge: action === 'promoteJudge' });
        break;
      case 'promoteDeveloper':
      case 'demoteDeveloper':
        changeRole(userName, { shouldBeDeveloper: action === 'promoteDeveloper' });
        break;
    }
  }, [webClient, changeRole]);

  const isAwaiting = (kind: ModerationFlow['kind'], userName: string) =>
    flow !== null && flow.kind === kind && flow.stage === 'loading' && flow.userName === userName;

  useReduxEffect<{ userInfo: ServerInfo_User }>(({ payload }) => {
    if (!flow || flow.stage !== 'loading' || payload.userInfo?.name !== flow.userName) {
      return;
    }
    if (flow.kind === 'banUser') {
      setFlow({ ...flow, stage: 'ready' });
    } else if (flow.kind === 'warnUser' && flow.clientId === null) {
      const clientId = payload.userInfo.clientid;
      setFlow({ ...flow, clientId });
      webClient.request.moderator.getWarnList(ownName, flow.userName, clientId);
    }
  }, server.Types.GET_USER_INFO, [flow, ownName, webClient]);

  useReduxEffect<{ warnList: Response_WarnList[] }>(({ payload }) => {
    if (flow?.kind === 'warnUser' && flow.clientId !== null && payload.warnList.some((list) => list.userName === flow.userName)) {
      setFlow({ ...flow, stage: 'ready' });
    }
  }, server.Types.WARN_LIST_OPTIONS, [flow]);

  useReduxEffect<{ userName: string; banHistory: ServerInfo_Ban[] }>(({ payload }) => {
    if (!isAwaiting('banHistory', payload.userName)) {
      return;
    }
    if (payload.banHistory.length === 0) {
      setFlow(null);
      setNotice({ title: t('Moderation.banHistory.title'), message: t('Moderation.banHistory.empty'), severity: 'info' });
    } else {
      setFlow({ kind: 'banHistory', userName: payload.userName, stage: 'ready' });
    }
  }, server.Types.BAN_HISTORY, [flow, t]);

  useReduxEffect<{ userName: string; warnHistory: ServerInfo_Warning[] }>(({ payload }) => {
    if (!isAwaiting('warnHistory', payload.userName)) {
      return;
    }
    if (payload.warnHistory.length === 0) {
      setFlow(null);
      setNotice({ title: t('Moderation.warnHistory.title'), message: t('Moderation.warnHistory.empty'), severity: 'info' });
    } else {
      setFlow({ kind: 'warnHistory', userName: payload.userName, stage: 'ready' });
    }
  }, server.Types.WARN_HISTORY, [flow, t]);

  useReduxEffect<UserNamePayload>(({ payload }) => {
    if (isAwaiting('adminNotes', payload.userName)) {
      setFlow({ kind: 'adminNotes', userName: payload.userName, stage: 'ready' });
    }
  }, server.Types.GET_ADMIN_NOTES, [flow]);

  useReduxEffect<FailedPayload>(({ payload }) => {
    if (!flow || flow.stage !== 'loading' || payload.target !== flow.userName) {
      return;
    }
    const command = payload.command as WebsocketTypes.ModeratorCommandName;
    if (command === 'warnList' && flow.kind === 'warnUser') {
      // Desktop opens the warning dialog regardless; it just has no reasons to offer.
      setFlow({ ...flow, stage: 'ready' });
      return;
    }
    const failures: Partial<Record<WebsocketTypes.ModeratorCommandName, ModerationNotice>> = {
      banHistory: { title: t('Moderation.banHistory.title'), message: t('Moderation.banHistory.failed'), severity: 'error' },
      warnHistory: { title: t('Moderation.warnHistory.title'), message: t('Moderation.warnHistory.failed'), severity: 'error' },
      getAdminNotes: { title: t('Moderation.common.failed'), message: t('Moderation.adminNotes.failed'), severity: 'info' },
    };
    const failure = failures[command];
    if (failure) {
      setFlow(null);
      // A timeout or lost connection explains itself in place of desktop's text.
      setNotice({ ...failure, message: describeFailure(payload.failure, failure.message) });
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [describeFailure, flow, t]);

  useReduxEffect<{ userName: string }>(({ payload }) => {
    const promoted = pendingRoleChanges.current.get(payload.userName);
    if (promoted === undefined) {
      return;
    }
    pendingRoleChanges.current.delete(payload.userName);
    setNotice({
      title: t('Moderation.common.success'),
      message: t(promoted ? 'Moderation.adjustMod.promoted' : 'Moderation.adjustMod.demoted'),
      severity: 'info',
    });
  }, server.Types.ADJUST_MOD, [t]);

  useReduxEffect<FailedPayload>(({ payload }) => {
    const promoted = pendingRoleChanges.current.get(payload.target);
    if (payload.command !== 'adjustMod' || promoted === undefined) {
      return;
    }
    pendingRoleChanges.current.delete(payload.target);
    setNotice({
      title: t('Moderation.common.failed'),
      message: describeFailure(payload.failure, t(promoted ? 'Moderation.adjustMod.promoteFailed' : 'Moderation.adjustMod.demoteFailed')),
      severity: 'info',
    });
  }, server.Types.ADMIN_COMMAND_FAILED, [describeFailure, t]);

  const submitWarn = useCallback((values: WarnUserFormValues) => {
    if (flow?.kind !== 'warnUser' || !ownName) {
      return;
    }
    webClient.request.moderator.warnUser(
      values.userName.trim(),
      values.reason.trim(),
      flow.clientId ?? '',
      values.redact ? REDACT_ALL_MESSAGES : undefined,
    );
    setFlow(null);
  }, [flow, ownName, webClient]);

  const submitBan = useCallback((values: BanUserFormValues) => {
    // Unticked identifiers go out as empty strings, as BanDialog's getters return them.
    webClient.request.moderator.banFromServer(
      banMinutes(values),
      values.byName ? values.userName : '',
      values.byIp ? values.address : '',
      values.reason,
      values.visibleReason,
      values.byClientId ? values.clientId : '',
      values.redact ? REDACT_ALL_MESSAGES : undefined,
    );
    setFlow(null);
  }, [webClient]);

  const submitAdminNotes = useCallback((notes: string) => {
    if (flow?.kind === 'adminNotes') {
      webClient.request.moderator.updateAdminNotes(flow.userName, notes);
    }
    setFlow(null);
  }, [flow, webClient]);

  return {
    flow,
    notice,
    userInfo,
    warnList,
    banHistory,
    warnHistory,
    adminNotes,
    open,
    close,
    dismissNotice,
    submitWarn,
    submitBan,
    submitAdminNotes,
  };
}
