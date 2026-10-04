import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { server } from '@cockatrice/datatrice';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { AlertDialog } from '@app/dialogs';
import { useKnownHosts } from '@app/feature-widgets/known-hosts';
import { getPreferencesSnapshot, LoadingState, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { getHostKey } from '@app/utils';

/** Servers this page load has already told the user about. Exported for tests. */
export const notifiedServers = new Set<string>();

/**
 * Desktop's "This server supports additional features that your client doesn't have" box
 * (ConnectionController::onNotifyUserAboutUpdate): a login whose response lists missing features
 * (Response_Login.missing_features, the server's features this client did not advertise), while
 * General › "Notify if a feature supported by the server is missing" is on. Desktop remembers the
 * features it has warned about across launches; here the notice shows once per server per page
 * load, as a reload is how a browser picks up a newer client. Mounted once in AppShell.
 */
export default function MissingFeaturesNotice() {
  const { t } = useTranslation();
  const knownHosts = useKnownHosts();
  const serverName = useAppSelector(server.Selectors.getName);
  const [open, setOpen] = useState(false);
  const selectedHost = knownHosts.status === LoadingState.READY ? knownHosts.value?.selectedHost : undefined;
  // Read when the login arrives; a dependency would re-run the effect on the same login.
  const serverKey = useRef('');
  serverKey.current = selectedHost ? getHostKey(selectedHost) : serverName;

  useReduxEffect<{ options: WebsocketTypes.LoginSuccessContext }>(({ payload: { options } }) => {
    if (!options.missingFeatures?.length || !getPreferencesSnapshot().notifyAboutMissingFeatures) {
      return;
    }
    if (notifiedServers.has(serverKey.current)) {
      return;
    }
    notifiedServers.add(serverKey.current);
    setOpen(true);
  }, server.Types.LOGIN_SUCCESSFUL, []);

  return (
    <AlertDialog
      isOpen={open}
      severity="info"
      title={t('MissingFeaturesNotice.title')}
      message={t('MissingFeaturesNotice.message')}
      onDismiss={() => setOpen(false)}
    />
  );
}
