import { useTranslation } from 'react-i18next';

import { useKnownHosts } from '@app/feature-widgets/known-hosts';
import { LoadingState, usePreference, useSettings } from '@app/hooks';
import { getHostKey } from '@app/utils';

import type { CustomControlProps } from '../registry';

/**
 * Desktop's startup "Server:" selector (general_settings_page.cpp), which lists the saved servers.
 * Here those are the login form's known hosts. A server that has since been removed stays listed
 * by its address, so the choice on screen is the one that is saved.
 */
export default function StartupServerSelect({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const knownHosts = useKnownHosts();
  const stored = usePreference('startupServer');
  const hosts = knownHosts.status === LoadingState.READY ? knownHosts.value?.hosts ?? [] : [];
  // Two known hosts can share a `host:port`; they are one server here, listed once.
  const options = [...new Map(hosts.map((host) => [getHostKey(host), host.name])).entries()]
    .map(([value, label]) => ({ value, label }));
  const missing = stored !== '' && !options.some((option) => option.value === stored);

  return (
    <select
      id={id}
      className="settings-input"
      value={stored}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => void settings.update({ startupServer: e.target.value })}
    >
      <option value="">{t('SettingsGeneral.startupServer.any')}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
      {missing && <option value={stored}>{stored}</option>}
    </select>
  );
}
