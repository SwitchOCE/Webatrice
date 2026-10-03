import { useTranslation } from 'react-i18next';

import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
import { Layout } from '@app/feature-wrappers/layout';

import LocalReplays from './LocalReplays';
import ReplayShareCodeDialog from './ReplayShareCodeDialog';
import ServerReplays from './ServerReplays';
import { useLocalReplays } from './useLocalReplays';
import { useServerReplays } from './useServerReplays';

import './Replays.css';

/**
 * The replays tab (desktop TabReplays): the local replay library on the left,
 * the account's server replay storage on the right. Works offline for local
 * replays; the server pane needs a registered login.
 */
function Replays() {
  const { t } = useTranslation();
  const serverReplays = useServerReplays();
  const local = useLocalReplays(serverReplays.librarySaves);
  const notice = local.notice ?? serverReplays.notice;
  const dismissNotice = local.notice ? local.dismissNotice : serverReplays.dismissNotice;
  const renaming = local.prompt?.kind === 'rename' ? local.prompt.entry : null;

  return (
    <Layout className="replays">
      <div className="replays__panes">
        <LocalReplays model={local} />
        <ServerReplays model={serverReplays} localFolderId={local.folderId} />
      </div>

      <PromptDialog
        isOpen={local.prompt != null}
        title={renaming
          ? (renaming.kind === 'folder' ? t('Replays.local.renameFolderTitle') : t('Replays.local.renameFileTitle'))
          : t('Replays.action.newFolder')}
        label={renaming ? t('Replays.local.newName') : t('Replays.local.newFolderName')}
        initialValue={renaming?.name ?? ''}
        validate={(value) => (value.trim() ? null : t('Replays.local.nameRequired'))}
        onSubmit={local.submitPrompt}
        onCancel={local.cancelPrompt}
      />

      <ConfirmDialog
        isOpen={local.deleteConfirmOpen}
        title={t('Replays.local.deleteTitle')}
        message={t('Replays.local.deleteMessage')}
        confirmLabel={t('Replays.action.delete')}
        destructive
        onConfirm={local.confirmDelete}
        onCancel={local.cancelDelete}
      />

      <ConfirmDialog
        isOpen={serverReplays.deleteConfirmOpen}
        title={t('Replays.server.deleteTitle')}
        message={t('Replays.server.deleteMessage')}
        confirmLabel={t('Replays.action.delete')}
        destructive
        onConfirm={serverReplays.confirmDelete}
        onCancel={serverReplays.cancelDelete}
      />

      <PromptDialog
        isOpen={serverReplays.submitPromptOpen}
        title={t('Replays.action.submitCode')}
        label={t('Replays.share.codeLabel')}
        validate={(value) => (value.trim() ? null : t('Replays.share.codeRequired'))}
        onSubmit={(value) => serverReplays.submitShareCode(value.trim())}
        onCancel={serverReplays.closeSubmitPrompt}
      />

      <ReplayShareCodeDialog code={serverReplays.shareCode} onClose={serverReplays.closeShareCode} />

      <AlertDialog
        isOpen={notice != null}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        severity={notice?.severity ?? 'error'}
        onDismiss={dismissNotice}
      />
    </Layout>
  );
}

export default Replays;
